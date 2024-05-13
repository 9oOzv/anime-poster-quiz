import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

var running = null;
var fuse = null;
var nextSearch = null;
var ready = false;


async function run() {
  if(!ready) {
    running = false;
    return;
  }
  while(nextSearch) {
    console.debug({ nextSearch });
    const str = nextSearch;
    nextSearch = null;
    const results = fuse.search(str).slice(0, 10).map(v => v.item);
    postMessage(results);
  }
  running = false;
}


function complete(query) {
  console.debug({ query });
  nextSearch = query;
  if(!running) {
    running = true;
    setTimeout(() => run(), 0);
  }
}


onmessage = function(e) {
  const data = e.data;
  const command = data.command;
  console.debug({ command });
  if(command == 'init') {
    fuse = new Fuse(data.completions);
    ready = true;
  }
  if(command == 'complete') {
    complete(data.query);
  }
}
