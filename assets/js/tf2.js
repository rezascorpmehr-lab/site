// assets/js/tf2.js

document.addEventListener("DOMContentLoaded", () => {
  const PRICE_URL = "https://raw.githubusercontent.com/rezascorpmehr-lab/site/main/price.json";
  const NOBITEX_URL = "https://apiv2.nobitex.ir/v3/orderbook/USDTIRT";
  const REFRESH_INTERVAL = 10000; // 20 seconds

  const tf2El = document.getElementById("tf2key-price");
  const tokenEl = document.getElementById("tf2token-price");

  let lastPrices = {
    tf2: null,
    token: null,
  };

  async function fetchPrices() {
    try {
      // 1️⃣ Load structured data from price.json
      const priceRes = await fetch(PRICE_URL + "?" + Date.now(), { cache: "no-store" });
      if (!priceRes.ok) throw new Error("Failed to fetch price.json");
      const data = await priceRes.json();

      const ruble = parseFloat(data.ruble ?? 1);
      const tf2Multiplier = parseFloat(data.tf2 ?? 1);
      const tokenMultiplier = parseFloat(data.token ?? 1);

      if (isNaN(ruble) || isNaN(tf2Multiplier) || isNaN(tokenMultiplier)) {
        throw new Error("Invalid data in price.json");
      }

      // 2️⃣ Fetch Nobitex USDT/IRT price
      const nobitexRes = await fetch(NOBITEX_URL, { cache: "no-store" });
      if (!nobitexRes.ok) throw new Error("Nobitex API error");
      const nobitexData = await nobitexRes.json();

      const lastTradePrice = parseFloat(nobitexData?.lastTradePrice);
      if (isNaN(lastTradePrice)) throw new Error("Invalid Nobitex response");

      // 3️⃣ Convert to toman and apply multipliers
      const baseToman = lastTradePrice / (10 * ruble);
      const tf2Price = Math.round(baseToman * tf2Multiplier);
      const tokenPrice = Math.round(baseToman * tokenMultiplier);

      updatePrice(tf2El, tf2Price, "tf2");
      updatePrice(tokenEl, tokenPrice, "token");
    } catch (err) {
      console.error("⚠️ Error fetching TF2 prices:", err);
      showError(tf2El);
      showError(tokenEl);
    }
  }

  function updatePrice(el, newPrice, key) {
    if (!el) return;

    const priceBox = el.closest(".price-box");
    if (!priceBox) return;

    priceBox.classList.remove("price-up", "price-down", "price-error");

    const oldPrice = lastPrices[key];
    const formatted = newPrice.toLocaleString("fa-IR");

    if (oldPrice !== null) {
      if (newPrice > oldPrice) {
        priceBox.classList.add("price-up");
        el.innerHTML = `${formatted} <span style="color:#00ff84;">▲</span>`;
      } else if (newPrice < oldPrice) {
        priceBox.classList.add("price-down");
        el.innerHTML = `${formatted} <span style="color:#ff4d4f;">▼</span>`;
      } else {
        el.textContent = formatted;
      }
    } else {
      el.textContent = formatted;
    }

    lastPrices[key] = newPrice;
  }

  function showError(el) {
    if (!el) return;
    const priceBox = el.closest(".price-box");
    if (priceBox) {
      priceBox.classList.remove("price-up", "price-down");
      priceBox.classList.add("price-error");
    }
    el.innerHTML = `<span style="color:#ff4d4f;">خطا در دریافت قیمت ❌</span>`;
  }

  fetchPrices();
  setInterval(fetchPrices, REFRESH_INTERVAL);
});
