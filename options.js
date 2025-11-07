const ids  = ["base","pue","cpt"];
const keys = ["baselineWhPer500Tokens","pue","charsPerToken"];

chrome.storage.sync.get(null).then(cfg => {
  ids.forEach((id,i)=>{ document.getElementById(id).value = cfg[keys[i]]; });
});

ids.forEach((id,i) => {
  document.getElementById(id).addEventListener("change", e => {
    chrome.storage.sync.set({ [keys[i]]: parseFloat(e.target.value) });
  });
});
