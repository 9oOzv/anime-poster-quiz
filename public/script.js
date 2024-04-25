var answerInput = null;
var nickInput = null;
var statusBox = null;
var content = null;
var compBox = null;
var compSelection = -1;
var image = null;

const worker = new Worker('static/worker.js', { type: "module" });

var statusMessages = [];

function getBlob(response) {
  if (!response.ok) {
    throw new Error('Failed fetching blob');
  }
  return response.blob();
}


async function getJson(response) {
  if (!response.ok) {
    throw new Error('Failed fetching JSON');
  }
  return response.json();
}

async function doStuff(data) {
  const op = data.action;
  if (op == 'image') {
    await fetchImage();
  } else if (op == 'results') {
    await fetchResults();
  } else if (op == 'reset') {
    await reset();
  } else if (op == 'reload') {
    await reload();
  } else {
    await unknown();
  }
}


function reload() {
  console.log('Reloading page')
  location.reload();
}


function unknown() {
  console.log('Received unknown action')
}


async function reset() {
  await fetch('reset');
  answerInput.value = '';
  compBox.innerHTML = '';
  compSelection = -1;
  content.innerHTML = '';
  image = null;
}


async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function run(){
  while(true) {
    await fetch('next')
      .then(getJson)
      .then(doStuff)
      .catch(async error => {
        reportError(error, 'Something went wrong');
        await sleep(5000);
      });
    await sleep(250);
  }
}


async function fetchImage() {
  console.log('Fetching image')
  await fetch('image.jpg')
    .then(getBlob)
    .then(blob => {
      const imageUrl = URL.createObjectURL(blob);
      if(image) {
        image.src = imageUrl;
      } else {
        image = document.createElement('img');
        image.src = imageUrl;
        image.alt = 'hint';
        image.classList.add('image');
        content.innerHTML = '';
        content.appendChild(image);
      }
    });
}


function resultLine(name, result) {
  const div = document.createElement('div');
  const a = document.createElement('span');
  const b = document.createElement('span');
  const c = document.createElement('span');
  const d = document.createElement('span');
  a.textContent = name;
  b.textContent = result.answer;
  c.textContent = `${result.time}ms`;
  d.textContent = result.correct ? '✓' : '✗';
  class_ = result.correct ? 'good' : 'bad';
  a.classList.add(class_);
  b.classList.add(class_);
  c.classList.add(class_);
  d.classList.add(class_);
  div.classList.add('result-line');
  div.appendChild(a);
  div.appendChild(b);
  div.appendChild(c);
  div.appendChild(d);
  return div;
}

function resultLines(results) {
  return Object.entries(results).map(
    ([name, result]) => resultLine(name, result)
  )
}


async function fetchResults() {
  console.log('Fetching results')
  await fetch('results')
    .then(getJson)
    .then(results => {
      const lines = resultLines(results);
      const div = document.createElement('div');
      div.classList.add('result-box');
      lines.forEach(
        l => div.appendChild(l)
      );
      content.innerHTML = div.outerHTML;
    });
}


function createAutofillOption(text) {
  const item = document.createElement('div');
  item.classList.add('completion-item')
  item.textContent = text;
  item.addEventListener('click', function() {
    answerInput.value = text;
    compBox.innerHTML = '';
  });
  compBox.appendChild(item);
}


worker.onmessage = (e) => {
  compBox.innerHTML = '';
  for(const v of e.data) {
    createAutofillOption(v);
  }
}


async function updateCompletions() {
  preAutofillInput = answerInput.value;
  worker.postMessage(answerInput.value);
}


function updateSelected(items) {
  items.forEach(function(item, index) {
    if (index === compSelection) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
  if (compSelection == -1) {
    answerInput.value = preAutofillInput;
    return
  }
}


function initKeyboard() {
  answerInput.addEventListener("keydown", function(event) {
    var items = compBox.querySelectorAll('div');
    if (event.key === 'ArrowDown') {
      compSelection = Math.min(compSelection + 1, items.length - 1);
      updateSelected(items);
    } else if (event.key === 'ArrowUp') {
      compSelection = Math.max(compSelection - 1, -1);
      updateSelected(items);
    } else if (event.key === 'Enter') {
      if (compSelection == -1) {
        submitAnswer();
      } else {
        answerInput.value = items[compSelection].textContent;
        compBox.innerHTML = '';
        compSelection = -1;
      }
    }
  });
}


function initAutofill() {
  answerInput.addEventListener("input", updateCompletions);
  initKeyboard();
}


function init() {
  compBox = document.getElementById("completion-box");
  statusBox = document.getElementById('status-box');
  content = document.getElementById('content-box');
  answerInput = document.getElementById("answer-input");
  nickInput = document.getElementById('nickname-input');
  initAutofill();
  run();
}


function statusMessage(msg, classes) {
  if (typeof classes === 'string') {
    classes = [ classes ];
  }
  const div = document.createElement('div');
  div.textContent = msg;
  div.classList.add(...classes, 'message');
  return div;
}


function addStatus(msg, classes) {
  const message = statusMessage(msg, classes);
  statusBox.appendChild(message);
  setTimeout(() => statusBox.removeChild(message), 10000);
}


function reportSuccess(msg) {
  addStatus(msg, 'good');
}


function reportError(error, msg) {
  if(msg) {
    console.trace(msg, error)
    addStatus(msg, 'bad');
  } else {
    console.trace(error)
    addStatus(error, 'bad');
  }
}


function responseReport(response, successMsg, errorMsg) {
  if (!response.ok) {
    reportError(errorMsg);
  } else {
    reportSuccess(successMsg);
  }
}


function submitAnswer() {
  const answer = answerInput.value;
  const nickname = nickInput.value;
  const data = { answer, nickname };
  console.log('submitting answer')
  fetch('submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(response => responseReport(response, 'Answer submitted', 'Submission failed'))
  .catch(error => reportError(error, 'Submission failed'));
}

document.addEventListener('DOMContentLoaded', function() {
  init();
});
