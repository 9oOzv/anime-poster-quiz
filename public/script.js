var answerInput = null;
var nickInput = null;
var appStatus = null;
var appContent = null;
var completions = null;
var answerDatalist = null;
var compSelection = -1;
var completionTypeCheckbox = null;
var responsiveCheckbox = true;
var setCompletionsFunction = null;
var prevViewId = null;
var currentViewId = null;
var initialViewId = null;
var responsiveLayout = true;
var ws = null;
var preAutofillInput = '';
const responsiveIds = [
  "root",
  "body",
  "app"
]
const viewIds = [
  "app-main",
  "menu",
  "settings"
]
var responsiveElements = null;
var viewElements = null;
const worker = new Worker('static/worker.js', { type: "module" });


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


function addStatus(msg, classes) {
  const message = statusMessage(msg, classes);
  appStatus.appendChild(message);
  setTimeout(() => appStatus.removeChild(message), 10000);
}


function reportSuccess(msg) {
  addStatus(msg, 'good');
}


function reportError(error, msg) {
  if(msg) {
    console.warn(msg, error)
    addStatus(msg, 'bad');
  } else {
    console.warn(error)
    addStatus(error, 'bad');
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
    completions.innerHTML = '';
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
  worker.postMessage({ command: "complete", query: answerInput.value });
}


function setCompletionItems(texts) {
    replaceContent(answerDatalist, null, '');
    replaceContent(completions, texts.map(createCompletionItem));
}

function setCompletionDatalistOptions(texts) {
    replaceContent(completions, null, '');
    replaceContent(answerDatalist, texts.map(createCompletionOption));
}

worker.onmessage = (e) => {
  console.log(e);
  setCompletionsFunction(e.data);
}


function setCompletionType(native) {
  if (native) {
    completions.style.display = 'none';
    deinitKeyboard();
    setCompletionsFunction = setCompletionDatalistOptions;
  } else {
    setCompletionsFunction = setCompletionItems;
    completions.style.display = 'flex';
    initKeyboard();
  }
}


function resultLine(name, result) {
  const _class = result.correct ? 'good' : 'bad';
  const spans = [
      createElement('span', _class, null, name),
      createElement('span', _class, null, result.answer),
      createElement('span', _class, null, `${result.time}ms`),
      createElement('span', _class, null, result.correct ? '✓' : '✗'),
  ];
  return createElement(
    'div',
    'result-line',
    spans
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


function sendCommand(command, ...args) {
  ws.send(JSON.stringify({ command, args }));
}


function submitAnswer() {
  sendCommand('answer', nickInput.value, answerInput.value);
}

function onKeyDown(event) {
    var items = completions.querySelectorAll('div');
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
        completions.innerHTML = '';
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
  answerInput.addEventListener("input", updateCompletions);
  initKeyboard();
}

function updateCompletionType() {
  setCompletionType(completionTypeCheckbox.checked);
}

function updateLayoutType() {
  setResponsive(responsiveCheckbox.checked);
}

function setResponsive(responsive) {
  if (responsive) {
    responsiveElements.forEach(e => e.classList.add('responsive'));
  } else {
    responsiveElements.forEach(e => e.classList.remove('responsive'));
  }
}

function setHidden(element, hidden) {
  console.log('setHidden', element, hidden);
  if(hidden) {
    element.classList.add('hidden')
  } else {
    element.classList.remove('hidden')
  }
}

function setView(viewId, fallback = initialViewId) {
  let viewWasSet = false;
  for(const e of viewElements) {
    setHidden(e, true);
  }
  for(const e of viewElements) {
    if(e.id === viewId) {
      prevViewId = currentViewId;
      currentViewId = viewId;
      setHidden(e, false);
      viewWasSet = true;
    } 
  }
  if(!viewWasSet && fallback) {
    setView(fallback, false);
  }
}


function toggleView(viewId) {
  if(viewId === currentViewId) {
    setView(prevViewId, currentViewId);
  } else {
    setView(viewId, currentViewId)
  }
}

function toggleMenu() {
  toggleView('menu');
}

function toggleSettings() {
  toggleView('settings');
}

function toggleResponsiveLayout() {
  if(responsiveLayout) {
    responsiveElements.foreach(e => e.classList.remove('responsive'))
  } else {
    responsiveElements.foreach(e => e.classList.add('responsive'))
  }
}


const commands = {};


commands.showImage = function(base64Data) {
  const img = createElement('img', 'image');
  img.src = 'data:image/jpeg;base64,' + base64Data;
  img.alt = 'hint';
  replaceContent(appContent, img);
}


commands.showResults = function(results) {
  lines = Object.entries(results).map(
    ([name, result]) => resultLine(name, result)
  )
  replaceContent(
    appContent,
    createElement(
      'div',
      'result-box',
      lines
    )
  )
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


commands.showMessages = function(messages) {
  replaceContent(
    appContent,
    messages.map(
      m => createElement(
        'div',
        'message-box',
        statusMessage(m.text, m.classes)
      )
    )
  );
}


commands.reset = function() {
  messages = [];
  completions.innerHTML = '';
  compSelection = -1;
  appContent.innerHTML = '';
  image = null;
}


commands.completions = function(data) {
  worker.postMessage({ command: "init", completions: data });
}


function init() {
  responsiveElements = responsiveIds.map(id => document.getElementById(id));
  viewElements = viewIds.map(id => document.getElementById(id));
  prevViewId
    = currentViewId
      = initialViewId
        = viewElements.find(e => !e.classList.contains('hidden')).id;
  setResponsive(true);
  menuView = document.getElementById("menu");
  completions = document.getElementById("completions");
  appMain = document.getElementById('app-main');
  appStatus = document.getElementById('app-status');
  appContent = document.getElementById('app-content');
  answerDatalist = document.getElementById('answer-datalist');
  completionTypeCheckbox = document.getElementById('completion-type-checkbox');
  responsiveCheckbox = document.getElementById('responsive-checkbox');
  answerInput = document.getElementById("answer-input");
  nickInput = document.getElementById('nickname-input');
  initCompletion();
  ws = new WebSocket('ws://localhost:3000/ws');
  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    console.debug({command: data.command});
    commands[data.command](...data.args);
  });
}


document.addEventListener('DOMContentLoaded', function() {
  init();
});
