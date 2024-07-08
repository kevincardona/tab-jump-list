// popup.js

let currentTabData = [];
let historyListElement = document.getElementById('history');
let clearHistoryButton = document.getElementById('clear-history');

const initPopup = () => {
    chrome.storage.onChanged.addListener(handleStorageChange);
    getTabHistory();
}

const handleStorageChange = (changes, areaName) => {
    console.log('Storage change detected:', changes, areaName);
    if (areaName === 'local' && (changes.tabHistory || changes.currentTabIndex)) {
        const newTabHistory = changes.tabHistory ? changes.tabHistory.newValue : currentTabData.history;
        const newTabIndex = changes.currentTabIndex ? changes.currentTabIndex.newValue : currentTabData.currentTabIndex;
        updateTabHistory({ history: newTabHistory, currentTabIndex: newTabIndex });
    }
}

const getTabHistory = () => {
    chrome.storage.local.get(['history', 'currentTabIndex'], (data) => {
        console.log('Retrieved tab history:', data);
        updateTabHistory(data);
    });
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
    listItem.title = `Tab ID: ${tab.tabId}`;
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
        setTimeout(()=>getTabHistory(), 100);
    });
}

document.addEventListener('DOMContentLoaded', initPopup);
