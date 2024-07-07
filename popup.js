// popup.js

let currentTabData = [];
let historyListElement = document.getElementById('history');
let clearHistoryButton = document.getElementById('clear-history');

const initPopup = () => {
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    requestTabHistoryUpdate();
}

const handleRuntimeMessage = (message, _, __) => {
    if (message.action === "updatePopupData") {
        console.log("Received data from background.js: ", message);
        updateTabHistory(message.data);
    }
}

const requestTabHistoryUpdate = () => {
    chrome.runtime.sendMessage({ action: "getTabHistory" }, updateTabHistory);
}

const updateTabHistory = (newData) => {
    if (JSON.stringify(newData) === JSON.stringify(currentTabData)) return;
    currentTabData = newData;
    renderHistoryList();
}

const renderHistoryList = () => {
    historyListElement.innerText = '';
    if (currentTabData.history && currentTabData.history.length > 0) {
        currentTabData.history.forEach((tab, idx) => {
            const li = createHistoryListElement(tab, idx, currentTabData.currentTabIndex);
            historyListElement.appendChild(li);
        });
    } else {
        historyListElement.appendChild(emptyHistoryListMessage());
    }
}

const createHistoryListElement = (tab, index) => {
    const listItem = document.createElement('li');
    listItem.textContent = tab.title;
    listItem.classList.add('tab');
    if (index === currentTabData.currentTabIndex) listItem.classList.add('current-tab');
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
    });
}

document.addEventListener('DOMContentLoaded', initPopup);
