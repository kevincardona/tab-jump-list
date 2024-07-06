// popup.js
let historyList = document.getElementById('history');
let clearHistoryButton = document.getElementById('clear-history');

document.addEventListener('DOMContentLoaded', () => {
    const handleMessage = (message, sender, sendResponse) => {
        if (message.action === "updatePopupData") {
            reloadTabHistory(message);
        }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    reloadTabHistory();
});

let data = [];
function reloadTabHistory() {
    chrome.runtime.sendMessage({ action: "getTabHistory" }, (response) => {
        if (response == data) return;
        data = response;

        historyList.innerText = '';
        if (data.history && data.history.length > 0) {
            data.history.forEach((tab, idx) => {
                const li = createHistoryListElement(tab, idx, data.currentTabIndex);
                historyList.appendChild(li);
            });
        } else {
            historyList.appendChild(emptyHistoryListMessage());
        }
    });
}

const createHistoryListElement = (tab, idx, currentIndex) => {
    const li = document.createElement('li');
    li.innerText = tab.title;
    li.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "openTab", index: idx });
    })
    li.classList.add('tab');
    if (currentIndex === idx) {
        li.classList.add('current-tab');
    }
    return li;
}

const emptyHistoryListMessage = () => {
    const li = document.createElement('li');
    li.innerText = 'No history to display';
    return li;
}

clearHistoryButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "clearTabHistory" });
});
