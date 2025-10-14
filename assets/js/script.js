if (typeof window.Chart === "undefined" && typeof Chart !== "undefined") {
  window.Chart = Chart;
}

document.addEventListener("DOMContentLoaded", () => {

  const API_URL = "https://apiv2.nobitex.ir/v3/orderbook/all";

  /* ========== USDT/RUB ORDERBOOK ========== */
  let lastPrice = null;
  const priceEl = document.getElementById("ruble-price");
  const asksTable = document.getElementById("asks-table");
  const bidsTable = document.getElementById("bids-table");

  function showWarning(message) {
    [asksTable, bidsTable].forEach((table) => {
      if (!table) return;
      table.innerHTML = `
        <tr>
          <td colspan="3" style="color:#ff4d4d;text-align:center;padding:1rem;font-weight:500;">
            ⚠️ ${message}
          </td>
        </tr>
      `;
    });
  }

  async function fetchOrderBook() {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Network response not OK");
      const data = await res.json();
      const usdt = data["USDTIRT"];
      if (!usdt?.asks || !usdt?.bids) throw new Error("USDTIRT not found");

      const bestAsk = parseFloat(usdt.asks[0][0]);
      const bestBid = parseFloat(usdt.bids[0][0]);
      const avgPrice = Math.round((bestAsk + bestBid) / 20);
      const avgPriceToman = Math.round(Math.round(avgPrice / 81));

      const priceBox = priceEl?.closest(".price-box");
      if (!priceEl || !priceBox) return;

      if (lastPrice !== null) {
        if (avgPriceToman > lastPrice) {
          priceBox.classList.remove("price-down");
          priceBox.classList.add("price-up");
          priceEl.innerHTML = `${avgPriceToman.toLocaleString("fa-IR")} <span style="color:#00ff84;">▲</span>`;
        } else if (avgPriceToman < lastPrice) {
          priceBox.classList.remove("price-up");
          priceBox.classList.add("price-down");
          priceEl.innerHTML = `${avgPriceToman.toLocaleString("fa-IR")} <span style="color:#ff4d4f;">▼</span>`;
        } else {
          priceBox.classList.remove("price-up", "price-down");
          priceEl.textContent = avgPriceToman.toLocaleString("fa-IR");
        }
      } else {
        priceEl.textContent = avgPriceToman.toLocaleString("fa-IR");
      }
      lastPrice = avgPriceToman;

      asksTable.innerHTML = "";
      bidsTable.innerHTML = "";

      usdt.asks.slice(0, 10).forEach(([p, a]) => {
        const toman = p / 10;
        const total = toman * a;
        asksTable.innerHTML += `
          <tr>
            <td>${toman.toLocaleString("fa-IR")}</td>
            <td>${parseFloat(a).toFixed(2)}</td>
            <td>${Math.round(total).toLocaleString("fa-IR")}</td>
          </tr>`;
      });
      usdt.bids.slice(0, 10).forEach(([p, a]) => {
        const toman = p / 10;
        const total = toman * a;
        bidsTable.innerHTML += `
          <tr>
            <td>${toman.toLocaleString("fa-IR")}</td>
            <td>${parseFloat(a).toFixed(2)}</td>
            <td>${Math.round(total).toLocaleString("fa-IR")}</td>
          </tr>`;
      });
    } catch (err) {
      console.error("❌ Orderbook fetch error:", err);
      showWarning("عدم توانایی در دریافت داده‌ها. لطفاً اتصال اینترنت خود را بررسی کنید.");
      const box = priceEl?.closest(".price-box");
      if (box) {
        box.classList.remove("price-up");
        box.classList.add("price-error");
      }
    }
  }

  if (priceEl) {
    fetchOrderBook();
    setInterval(fetchOrderBook, 10000);
  }

  /* ========== DATE & TIME ========== */
  function updateDateTime() {
    const now = new Date();
    const date = new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(now);
    const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
    const el = document.getElementById("datetime");
    if (el) el.textContent = `${date} - ${time}`;
  }
  updateDateTime();
  setInterval(updateDateTime, 1000);

  /* ========== CRYPTO TABLE ========== */
  const cryptoTable = document.getElementById("crypto-table-body");
  if (!cryptoTable) return;

  const generateMockData = (basePrice) => {
    const data = [];
    for (let i = 0; i < 20; i++) {
        // create small random variation around base price
        const variation = (Math.random() - 0.5) * basePrice * 0.002;
        data.push(Math.round(basePrice + variation));
    }
    return data;
  };

  const cryptoRows = cryptoTable.querySelectorAll("tr");
  const charts = {};
  const priceHistory = {};

  async function updateCryptoPrices() {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Network error");
      const data = await res.json();

      cryptoRows.forEach((row) => {
        const symbol = row.dataset.symbol;
        const market = `${symbol}IRT`;
        const info = data[market];
        const priceCell = row.querySelector(".price");
        const canvas = row.querySelector(".sparkline");

        if (!info?.asks || !info?.bids) {
          priceCell.textContent = "—";
          return;
        }

        const bestAsk = parseFloat(info.asks[0][0]);
        const bestBid = parseFloat(info.bids[0][0]);
        let avg = Math.round((bestAsk + bestBid) / 20);
        if (symbol === 'USDT') {
          avg += 1000;
        }

        // Update price trend
        if (!priceHistory[symbol]) {
            priceHistory[symbol] = generateMockData(avg);
        }

        // Clone numeric-only array to avoid Chart.js metadata pollution
        const history = [...priceHistory[symbol].map(Number)];
        history.push(Number(avg));
        if (history.length > 20) history.shift();
        priceHistory[symbol] = history; // store clean numeric array

        const last = history.length > 1 ? history[history.length - 2] : avg;
        const isUp = avg > last;
        const isDown = avg < last;
        const color = isUp ? "#00ff84" : isDown ? "#ff4d4f" : "#888";
        const arrow = isUp ? "▲" : isDown ? "▼" : "";

        // Update displayed price
        priceCell.innerHTML = `${avg.toLocaleString("fa-IR")} <span style="color:${color}">${arrow}</span>`;
        priceCell.style.color = color;
        
        // Draw / Update sparkline
        if (!charts[symbol]) {
            const ctx = canvas?.getContext?.("2d");
            if (!ctx) {
                console.warn(`⚠️ No 2D context found for ${symbol}`);
                return;
            }

            canvas.width = 100;
            canvas.height = 28;

            charts[symbol] = new Chart(ctx, {
                type: "line",
                data: {
                labels: history.map((_, i) => i),
                datasets: [{
                    data: [...history],
                    borderColor: color,
                    borderWidth: 1.5,
                    tension: 0.3,
                    pointRadius: 0,
                    fill: false,
                }],
                },
                options: {
                responsive: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false },
                },
                },
            });
            } else {
            const chart = charts[symbol];
            chart.data.labels = history.map((_, i) => i);
            chart.data.datasets[0].data = [...history];
            chart.data.datasets[0].borderColor = color;
            chart.update("none");
            }
      });
    } catch (err) {
      console.error("⚠️ Crypto update failed:", err);
      cryptoRows.forEach((r) => {
        const cell = r.querySelector(".price");
        cell.textContent = "خطا در دریافت داده";
        cell.style.color = "#ff4d4f";
      });
    }
  }

  updateCryptoPrices();
  setInterval(updateCryptoPrices, 15000);
});
