chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (cfg) => {
    if (!cfg || Object.keys(cfg).length === 0) {
      chrome.storage.sync.set({
        baselineWhPer500Tokens: 0.30,
        pue: 1.2,
        gridKgCO2PerKWh: 0.40,
        charsPerToken: 4,
        crankNetWatts: 40,
        pullSeconds: 2,
        pullWatts: 100
      });
    }
  });
});
