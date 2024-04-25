
var fuse = null;
var autofillChoices = [];
var answerInput = null;
var nickInput = null;
var statusBox = null;
var content = null;
var compBox = null;
var compSelection = -1

function getBlob(response) {
  if (!response.ok) {
    console.error('Error fetching blob')
    setTimeout(run, 5000);
  }
  return response.blob();
}


async function getJson(response) {
  if (!response.ok) {
    console.error('Error fetching JSON')
    setTimeout(run, 5000);
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
  statusBox.innerHTML = '';
}


async function run(){
  await fetch('next')
    .then(getJson)
    .then(doStuff)
    .catch(error => reportError(error, 'Something went wrong'))
    .finally(_ => setTimeout(run, 500));
}


async function fetchImage() {
  console.log('Fetching image')
  await fetch('image.jpg')
    .then(getBlob)
    .then(blob => {
      const imageUrl = URL.createObjectURL(blob);
      content.innerHTML = `<img class='image' src="${imageUrl}" alt="Fetched Image">`;
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
  c.textContent = result.correct ? '✓' : '✗';
  d.textContent = `${result.time}ms`;
  class_ = result.correct ? 'good' : 'bad';
  a.classList.add(class_);
  b.classList.add(class_);
  c.classList.add(class_);
  d.classList.add(class_);
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
      content.innerHTML = '';
      lines.forEach(
        l => content.appendChild(l)
      );
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


async function updateCompBox() {
  preAutofillInput = answerInput.value
  compBox.innerHTML = '';
  compSelection = -1;
  const filtered = fuse.search(preAutofillInput).slice(0, 10).map(v => v.item);
  filtered.forEach(createAutofillOption);
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
  fetchChoices();
  answerInput.addEventListener("input", updateCompBox);
  initKeyboard();
}


async function fetchChoices() {
  choices = await fetch('choices')
    .then(getJson)
    .catch(error => reportError(error, 'Fetching autofill options failed'));
  fuse = new Fuse(choices);
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


function messageHtml(msg, classes) {
  if (typeof classes === 'string') {
    classes = [ classes ];
  }
  const div = document.createElement('div');
  div.textContent = msg;
  div.classList.add(...classes);
  return div.outerHTML;
}


function resetStatusBox() {
  statusBox.innerHTML = '';
}


function setStatusBox(msg, classes) {
  statusBox.innerHTML = messageHtml(msg, classes);
  setTimeout(resetStatusBox, 2000);
}


function reportSuccess(msg) {
  setStatusBox(msg, 'success');
}



function reportError(error, msg) {
  if(msg) {
    console.trace(msg, error)
    setStatusBox(msg, 'error');
  } else {
    console.trace(error)
    setStatusBox(error, 'error');
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
