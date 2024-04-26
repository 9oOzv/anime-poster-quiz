import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

var running = null;
var fuse = null;
var nextSearch = null;

async function updateCompletions() {
  console.log('Updating completions');
  const completions = await fetch('../completions')
    .then(response => response.json())
    .catch(_ => console.error('Fetching completions failed'));
  fuse = new Fuse(completions);
}


async function run() {
  if(!fuse) {
    await updateCompletions();
  }
  while(nextSearch) {
    const str = nextSearch;
    nextSearch = null;
    const results = fuse.search(str).slice(0, 10).map(v => v.item);
    postMessage(results);
  }
  running = false;
}


onmessage = function(e) {
  console.log(nextSearch);
  console.log(running);
  nextSearch = e.data;
  if(!running) {
    running = true;
    setTimeout(() => run(), 0);
  }
}
