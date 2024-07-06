let currentTabIndex = -1;
let tabHistory = [];
let ignoreNextActivatedEvent = false;

const loadHistoryFromStorage = async () => {
    return new Promise((resolve) => {
        chrome.storage.local.get(['tabHistory', 'currentTabIndex'], (result) => {
            tabHistory = result.tabHistory || [];
            currentTabIndex = result.currentTabIndex || -1;
            resolve();
        });
    });
};

const addTabToHistory = async (tabId) => {
    if (ignoreNextActivatedEvent) {
        ignoreNextActivatedEvent = false;
        return;
    }

    if (tabHistory.length > 0 && tabId === tabHistory[0].tabId) {
        return;
    }

    if (currentTabIndex !== 0) {
        tabHistory = tabHistory.slice(currentTabIndex);
        currentTabIndex = 0;
    }

    try {
        const tab = await getTabById(tabId);
        tabHistory.unshift(tab);
        handleDataUpdate();
    } catch (error) {
        console.error(`Failed to add tab to history: ${error}`);
    }
};

const clearTabHistory = () => {
    tabHistory = [];
    currentTabIndex = -1;
    chrome.storage.local.set({ tabHistory: tabHistory });
    handleDataUpdate();
};

const openTab = (tabId) => {
    return new Promise((resolve) => {
        chrome.tabs.get(tabId, (_) => {
            if (chrome.runtime.lastError) {
                console.log(`Tab ${tabId} does not exist. Ignoring openTab request.`);
                resolve(false);
            } else {
                ignoreNextActivatedEvent = true;
                chrome.tabs.update(tabId, { active: true }, () => {
                    resolve(true);
                });
            }
        });
    });
};

const openTabByIndex = async (index) => {
    if (index < 0 || index >= tabHistory.length) {
        return;
    }
    const tab = tabHistory[index];
    console.log(`Opening tab ${tab.tabId} by index ${index}`);
    let success = await openTab(tab.tabId);
    if (!success) {
        tabHistory.splice(index, 1);
        await openTabByIndex(index);
    }
}

const getTabById = (tabId) => {
    return new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError.message);
            } else {
                resolve({ tabId: tab.id, title: tab.title || tab.id + (" (no title)") });
            }
        });
    });
};

const setCurrentTabIndex = (index) => {
    currentTabIndex = index;
    openTabByIndex(index);
    handleDataUpdate();
};

const goBack = async () => {
    if (currentTabIndex < tabHistory.length - 1) {
        currentTabIndex++;
        const previousTab = tabHistory[currentTabIndex];
        console.log(`Going back to tab ${previousTab.tabId}`);
        let success = await openTab(previousTab.tabId);
        if (!success) {
            tabHistory.splice(currentTabIndex, 1);
            currentTabIndex--;
            await goBack();
        }
    }
    handleDataUpdate();
};

const goForward = async () => {
    if (currentTabIndex > 0) {
        currentTabIndex--;
        const nextTab = tabHistory[currentTabIndex];
        console.log(`Going forward to tab ${nextTab.tabId}`);
        let success = await openTab(nextTab.tabId);
        if (!success) {
            tabHistory.splice(currentTabIndex, 1);
            await goForward();
        }
    }
    handleDataUpdate();
};

const handleDataUpdate = async () => {
    await chrome.storage.local.set({ tabHistory: tabHistory, currentTabIndex: currentTabIndex });
    let data = { history: tabHistory, currentTabIndex: currentTabIndex };
    chrome.runtime.sendMessage({ action: "updatePopupData", data: data }, (response) => {
        if (chrome.runtime.lastError) {
            console.log("Failed to send data to popup.js: ", chrome.runtime.lastError.message);
        } else {
            console.log("Refreshed data sent to popup.js", response);
        }
    });
};

chrome.runtime.onStartup.addListener(async () => {
    await loadHistoryFromStorage();
});

chrome.commands.onCommand.addListener((command) => {
    switch (command) {
        case "go-back":
            goBack();
            break;
        case "go-forward":
            goForward();
            break;
    }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    addTabToHistory(activeInfo.tabId);
    console.log(`Tab ${activeInfo.tabId} is now active.`);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        return;
    }
    chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
        if (tabs.length > 0) {
            addTabToHistory(tabs[0].id);
            console.log(`Window focus changed, tab ${tabs[0].id} is now active.`);
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case "openTab":
            setCurrentTabIndex(request.index);
            break
        case "getTabHistory":
            sendResponse({ history: tabHistory, currentTabIndex: currentTabIndex });
            break;
        case "clearTabHistory":
            clearTabHistory();
            break;
    }
});

