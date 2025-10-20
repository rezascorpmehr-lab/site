if (typeof window.Chart === "undefined" && typeof Chart !== "undefined") {
  window.Chart = Chart;
}

document.addEventListener("DOMContentLoaded", () => {
  // --- CONFIGURATION & CONSTANTS ---
  const NOBITEX_API_URL = "https://rspro.rezascorpmehr.workers.dev";
  const GITHUB_PRICE_URL = "https://raw.githubusercontent.com/rezascorpmehr-lab/site/main/price.json";
  const DATA_REFRESH_INTERVAL = 10000; // ms (10 seconds)

  // --- DOM ELEMENT SELECTORS ---
  const priceEl = document.getElementById("ruble-price");
  const asksTable = document.getElementById("asks-table");
  const bidsTable = document.getElementById("bids-table");
  const dateTimeEl = document.getElementById("datetime");
  const cryptoTableBody = document.getElementById("crypto-table-body");
  const cryptoRows = cryptoTableBody ? cryptoTableBody.querySelectorAll("tr") : [];

  // --- STATE MANAGEMENT ---
  let lastUsdtPrice = null;
  const charts = {};
  const priceHistory = {};

  // --- UI UPDATE FUNCTIONS ---

  function showOrderBookWarning(message) {
    const warningHtml = `
      <tr>
        <td colspan="3" style="color:#ff4d4d;text-align:center;padding:1rem;font-weight:500;">
          ⚠️ ${message}
        </td>
      </tr>`;
    if (asksTable) asksTable.innerHTML = warningHtml;
    if (bidsTable) bidsTable.innerHTML = warningHtml;
  }

  function updateOrderbookUI(usdtData, dynamicRate) {
    if (!priceEl || !asksTable || !bidsTable) return;

    if (!usdtData?.asks?.length || !usdtData?.bids?.length) {
      showOrderBookWarning("اطلاعات 'USDTIRT' در پاسخ دریافتی وجود ندارد.");
      return;
    }

    const bestAsk = parseFloat(usdtData.asks[0][0]);
    const bestBid = parseFloat(usdtData.bids[0][0]);
    const avgPriceRial = (bestAsk + bestBid) / 2;
    const avgPriceToman = Math.round(avgPriceRial / (10 * dynamicRate));

    const priceBox = priceEl.closest(".price-box");
    if (priceBox) {
      priceBox.classList.remove("price-up", "price-down", "price-error");
      if (lastUsdtPrice !== null) {
        if (avgPriceToman > lastUsdtPrice) {
          priceBox.classList.add("price-up");
          priceEl.innerHTML = `${avgPriceToman.toLocaleString("fa-IR")} <span style="color:#00ff84;">▲</span>`;
        } else if (avgPriceToman < lastUsdtPrice) {
          priceBox.classList.add("price-down");
          priceEl.innerHTML = `${avgPriceToman.toLocaleString("fa-IR")} <span style="color:#ff4d4f;">▼</span>`;
        } else {
          priceEl.textContent = avgPriceToman.toLocaleString("fa-IR");
        }
      } else {
        priceEl.textContent = avgPriceToman.toLocaleString("fa-IR");
      }
    }
    lastUsdtPrice = avgPriceToman;

    const createTableRows = (rows) =>
      rows.slice(0, 10).map(([price, amount]) => {
          const toman = parseFloat(price) / 10;
          const total = toman * parseFloat(amount);
          return `
            <tr>
              <td>${toman.toLocaleString("fa-IR")}</td>
              <td>${parseFloat(amount).toFixed(2)}</td>
              <td>${Math.round(total).toLocaleString("fa-IR")}</td>
            </tr>`;
        }).join('');

    asksTable.innerHTML = createTableRows(usdtData.asks);
    bidsTable.innerHTML = createTableRows(usdtData.bids);
  }

  function updateCryptoTableUI(allMarketsData) {
    if (!cryptoRows.length) return;

    cryptoRows.forEach((row) => {
      const symbol = row.dataset.symbol;
      const market = `${symbol}IRT`;
      const info = allMarketsData[market];
      const priceCell = row.querySelector(".price");
      const canvas = row.querySelector(".sparkline");

      if (!info?.asks?.length || !info?.bids?.length) {
        priceCell.textContent = "—";
        return;
      }

      const bestAsk = parseFloat(info.asks[0][0]);
      const bestBid = parseFloat(info.bids[0][0]);
      let avgToman = Math.round(((bestAsk + bestBid) / 2) / 10);

      if (symbol === 'USDT') {
        avgToman += 1000;
      }

      if (!priceHistory[symbol]) {
        priceHistory[symbol] = Array(20).fill(avgToman);
      }
      priceHistory[symbol].push(avgToman);
      if (priceHistory[symbol].length > 20) {
        priceHistory[symbol].shift();
      }
      
      const history = priceHistory[symbol];
      const lastPrice = history.length > 1 ? history[history.length - 2] : avgToman;
      const isUp = avgToman > lastPrice;
      const isDown = avgToman < lastPrice;
      const color = isUp ? "#00ff84" : isDown ? "#ff4d4f" : "#888";
      const arrow = isUp ? "▲" : isDown ? "▼" : "";

      priceCell.innerHTML = `${avgToman.toLocaleString("fa-IR")} <span style="color:${color}">${arrow}</span>`;
      priceCell.style.color = color;

      // Draw or Update the sparkline chart
      if (!charts[symbol]) {
        const ctx = canvas?.getContext?.("2d");
        if (!ctx) return;
        canvas.width = 100;
        canvas.height = 28;
        charts[symbol] = new Chart(ctx, {
          type: "line",
          data: {
            labels: history.map((_, i) => i),
            datasets: [{
              data: history,
              borderColor: color,
              borderWidth: 1.5,
              tension: 0.3,
              pointRadius: 0,
            }, ],
          },
          options: {
            responsive: false,
            animation: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: false } },
          },
        });
      } else {
        const chart = charts[symbol];
        chart.data.datasets[0].data = history;
        chart.data.datasets[0].borderColor = color;
        chart.update("none");
      }
    });
  }

  function updateDateTime() {
    if (!dateTimeEl) return;
    const now = new Date();
    const date = new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(now);
    const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
    dateTimeEl.textContent = `${date} - ${time}`;
  }

  // --- DATA FETCHING WITH AUTO-FALLBACK & MEMORY ---
  let lastPriceFetchTime = 0;
  let cachedDynamicRate = null;
  let preferredSource = localStorage.getItem("preferredSource") || "direct";

  async function fetchAndUpdateAll() {
    const WORKER_URL = "https://rspro.rezascorpmehr.workers.dev";
    const DIRECT_URL = "https://apiv2.nobitex.ir/v3/orderbook/all";

    async function safeFetch(url, options = {}, timeout = 8000) {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeout))
      ]);
    }

    async function fetchFromSource(source) {
      const url = source === "direct" ? DIRECT_URL : WORKER_URL;
      const res = await safeFetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${source} fetch failed: ${res.statusText}`);
      return res.json();
    }

    try {
      const nobitexData = await fetchFromSource(preferredSource);
      localStorage.setItem("preferredSource", preferredSource);

      const now = Date.now();
      if (!cachedDynamicRate || now - lastPriceFetchTime > 2 * 60 * 1000) {
        const githubRes = await safeFetch(GITHUB_PRICE_URL, { cache: "no-store" });
        if (!githubRes.ok) throw new Error(`GitHub Error: ${githubRes.statusText}`);
        const data = await githubRes.json();
        cachedDynamicRate = parseFloat(data.ruble ?? data.price ?? Object.values(data)[0]);
        lastPriceFetchTime = now;
      }

      updateOrderbookUI(nobitexData["USDTIRT"], cachedDynamicRate);
      updateCryptoTableUI(nobitexData);

    } catch (firstErr) {
      console.warn(`⚠️ ${preferredSource} source failed:`, firstErr.message);
      const fallbackSource = preferredSource === "direct" ? "worker" : "direct";

      try {
        const nobitexData = await fetchFromSource(fallbackSource);
        preferredSource = fallbackSource;
        localStorage.setItem("preferredSource", preferredSource);
        console.info(`✅ Switched to ${fallbackSource} as preferred source.`);

        const now = Date.now();
        if (!cachedDynamicRate || now - lastPriceFetchTime > 2 * 60 * 1000) {
          const githubRes = await safeFetch(GITHUB_PRICE_URL, { cache: "no-store" });
          if (!githubRes.ok) throw new Error(`GitHub Error: ${githubRes.statusText}`);
          const data = await githubRes.json();
          cachedDynamicRate = parseFloat(data.ruble ?? data.price ?? Object.values(data)[0]);
          lastPriceFetchTime = now;
        }

        updateOrderbookUI(nobitexData["USDTIRT"], cachedDynamicRate);
        updateCryptoTableUI(nobitexData);

      } catch (finalErr) {
        console.error("❌ Both sources failed:", finalErr);
        showOrderBookWarning("عدم توانایی در دریافت داده‌ها. لطفاً اتصال اینترنت خود را بررسی کنید.");
        const priceBox = priceEl?.closest(".price-box");
        if (priceBox) {
          priceBox.classList.remove("price-up", "price-down");
          priceBox.classList.add("price-error");
        }
      }
    }
  }

  // --- INITIALIZATION ---
  function initialize() {
    if (dateTimeEl) {
      updateDateTime();
      setInterval(updateDateTime, 1000);
    }

    if (priceEl || cryptoTableBody) {
      fetchAndUpdateAll();
      setInterval(fetchAndUpdateAll, DATA_REFRESH_INTERVAL);
    }
  }

  initialize();
});