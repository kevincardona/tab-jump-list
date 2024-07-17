// popup.js

let historyData = [];
let tabHistoryIndex = -1;
let faviconCache = {};
let historyListElement = document.getElementById('history');
let clearHistoryButton = document.getElementById('clear-history');

const initPopup = () => {
    chrome.storage.onChanged.addListener(handleStorageChange);
    getTabHistory();
}

const handleStorageChange = (changes, areaName) => {
    console.log('Storage change detected:', changes, areaName);
    getTabHistory();
}

const getTabHistory = () => {
    chrome.storage.local.get(['tabHistory', 'tabHistoryIndex'], (data) => {
        historyData = data.tabHistory || [];
        tabHistoryIndex = data.tabHistoryIndex !== undefined ? data.tabHistoryIndex : -1;
        renderHistoryList();
    });
}

const renderHistoryList = () => {
    historyListItems = [];
    historyListElement.innerText = '';
    if (historyData.length > 0) {
        historyData.forEach((tab, idx) => {
            const li = createHistoryListElement(tab, idx);
            historyListItems.push(li);
            historyListElement.appendChild(li);
        });
    } else {
        historyListElement.appendChild(emptyHistoryListMessage());
    }
    lastRenderedHistory = [...historyData];  // Save the current state
}

const createHistoryListElement = (tab, index) => {
    console.log('Creating history list element:', tab, index);
    const listItem = document.createElement('li');
    listItem.classList.add('tab-item');

    const favicon = document.createElement('img');
    favicon.src = tab.favIconUrl || '';
    favicon.classList.add('favicon');
    listItem.appendChild(favicon);

    const title = document.createElement('span');
    title.textContent = tab.title;
    listItem.appendChild(title);

    listItem.title = `Tab ID: ${tab.id}`;
    listItem.classList.add('tab');
    if (index === tabHistoryIndex) listItem.classList.add('current-tab');
    listItem.dataset.index = index;
    listItem.addEventListener('click', () => handleTabClick(index));
    return listItem;
}

const handleTabClick = (index) => {
    chrome.runtime.sendMessage({ action: "openTab", index: index });
}

const emptyHistoryListMessage = () => {
    const li = document.createElement('li');
    li.innerText = 'No history to display';
    return li;
}

if (clearHistoryButton) {
    clearHistoryButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "clearTabHistory" });
        setTimeout(() => getTabHistory(), 100);
    });
}

document.addEventListener('DOMContentLoaded', initPopup);

