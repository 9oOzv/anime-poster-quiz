var answerInput = null;
var nickInput = null;
var statusBox = null;
var contentBox = null;
var compBox = null;
var answerDatalist = null;
var compSelection = -1;
var completionTypeCheckbox = null;
var image = null;
var setCompletionsFunction = null;

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


async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function reload() {
  console.log('Reloading page')
  location.reload();
}


function unknown() {
  console.log('Received unknown action')
}


function createElement(element, classes, children, textContent) {
  classes ??= [];
  if(!Array.isArray(classes)) {
    classes = [ classes ]
  }
  children ??= [];
  if(!Array.isArray(children)) {
    children = [ children ]
  }
  const e = document.createElement(element);
  classes.forEach(c => e.classList.add(c));
  children.forEach(c => e.appendChild(c));
  if (textContent) {
    e.textContent = textContent;
  }
  return e;
}
 
function replaceContent(element, children, textContent) {
  children ??= [];
  if(!Array.isArray(children)) {
    children = [ children ]
  }
  element.innerHTML = '';
  if (textContent) {
    element.textContent = textContent;
  }
  children.forEach(c => element.appendChild(c));
}


function showMessages(messages) {
  replaceContent(
    contentBox,
    messages.map(
      m => createElement(
        'div',
        'message-box',
        statusMessage(m.text, m.classes)
      )
    )
  );
}


function statusMessage(msg, classes) {
  classes ??= []
  if(!Array.isArray(classes)) {
    classes = [ classes ]
  }
  return createElement(
    'div',
    [...classes, 'message'],
    null,
    msg
  )
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


function createCompletionItem(text) {
  const item = createElement(
    'div',
    'completion-item',
    null,
    text
  )
  item.addEventListener('click', function() {
    answerInput.value = text;
    compBox.innerHTML = '';
  });
  return item;
}


function createCompletionOption(text) {
  const item = createElement(
    'option',
    'completion-option',
    null,
    text
  )
  return item;
}


async function updateCompletions() {
  preAutofillInput = answerInput.value;
  worker.postMessage(answerInput.value);
}


function setCompletionBoxItems(texts) {
    replaceContent(answerDatalist, null, '');
    replaceContent(compBox, texts.map(createCompletionItem));
}

function setCompletionDatalistOptions(texts) {
    replaceContent(compBox, null, '');
    replaceContent(answerDatalist, texts.map(createCompletionOption));
}

worker.onmessage = (e) => {
  console.log(e);
  setCompletionsFunction(e.data);
}


function setCompletionType(native) {
  if (native) {
    compBox.style.display = 'none';
    deinitKeyboard();
    setCompletionsFunction = setCompletionDatalistOptions;
  } else {
    setCompletionsFunction = setCompletionBoxItems;
    compBox.style.display = 'flex';
    initKeyboard();
  }
}


function resultLine(name, result) {
  class_ = result.correct ? 'good' : 'bad';
  const spans = [
      createElement('span', class_, null, name),
      createElement('span', class_, null, result.answer),
      createElement('span', class_, null, `${result.time}ms`),
      createElement('span', class_, null, result.correct ? '✓' : '✗'),
  ];
  return createElement(
    'div',
    'result-line',
    spans
  )
}

function resultLines(results) {
  return Object.entries(results).map(
    ([name, result]) => resultLine(name, result)
  )
}


function updateSelectedCompletion(items) {
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


async function doReset() {
  const json = await fetch('reset');
  messages = [];
  compBox.innerHTML = '';
  compSelection = -1;
  contentBox.innerHTML = '';
  image = null;
}


async function doMessage() {
  const json = await fetch('message')
    .then(res => res.json());
  showMessages(json.data.messages);
}


async function doNextImage() {
  console.log('Fetching image')
  await fetch('next.jpg')
    .then(getBlob)
    .then(blob => {
      const imageUrl = URL.createObjectURL(blob);
      if(image) {
        image.src = imageUrl;
      } else {
        image = createElement('img', 'image');
        image.src = imageUrl;
        image.alt = 'hint';
        replaceContent(contentBox, image);
      }
    });
}


async function doResults() {
  console.log('Fetching results')
  await fetch('results')
    .then(getJson)
    .then(results => {
      const lines = resultLines(results);
      replaceContent(
        contentBox,
        createElement(
          'div',
          'result-box',
          lines
        )
      )
    });
}


async function doStuff(data) {
  const op = data.action;
  if (op == 'image') {
    await doNextImage();
  } else if (op == 'results') {
    await doResults();
  } else if (op == 'reset') {
    await doReset();
  } else if (op == 'reload') {
    await doReload();
  } else if (op == 'message') {
    await doMessage();
  } else {
    await unknown();
  }
}


function onKeyDown(event) {
    var items = compBox.querySelectorAll('div');
    if (event.key === 'ArrowDown') {
      compSelection = Math.min(compSelection + 1, items.length - 1);
      updateSelectedCompletion(items);
    } else if (event.key === 'ArrowUp') {
      compSelection = Math.max(compSelection - 1, -1);
      updateSelectedCompletion(items);
    } else if (event.key === 'Enter') {
      if (compSelection == -1) {
        submitAnswer();
      } else {
        answerInput.value = items[compSelection].textContent;
        compBox.innerHTML = '';
        compSelection = -1;
      }
    }
}


function initKeyboard() {
  answerInput.addEventListener("keydown", onKeyDown);
}


function deinitKeyboard() {
  answerInput.removeEventListener("keydown", onKeyDown);
}


function initCompletion() {
  setCompletionType(completionTypeCheckbox.checked);
  completionTypeCheckbox.addEventListener(
    'change',
    function() {
      setCompletionType(this.checked);
    }
  );
  answerInput.addEventListener("input", updateCompletions);
  initKeyboard();
}


function init() {
  compBox = document.getElementById("completion-box");
  statusBox = document.getElementById('status-box');
  contentBox = document.getElementById('contents-box');
  answerDatalist = document.getElementById('answer-datalist');
  completionTypeCheckbox = document.getElementById('completion-type-checkbox');
  answerInput = document.getElementById("answer-input");
  nickInput = document.getElementById('nickname-input');
  initCompletion();
  run();
}


async function run() {
  while(true) {
    await fetch('next')
      .then(getJson)
      .then(doStuff)
      .catch(async error => {
        reportError(error, 'Something went wrong');
        await sleep(5000);
      });
    await sleep(100);
  }
}


document.addEventListener('DOMContentLoaded', function() {
  init();
});
