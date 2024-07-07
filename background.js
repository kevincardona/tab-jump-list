// background.js

let currentTabIndex = -1;
let tabHistory = [];
let loadingHistory = true;
let ignoreNextActivatedEvent = true;

/** Loads the tab history from storage. */
const loadHistoryFromStorage = async () => {
    return new Promise((resolve) => {
        console.log("Loading tab history from storage...");
        chrome.storage.local.get(['history', 'currentTabIndex'], (result) => {
            tabHistory = result.history || [];
            currentTabIndex = result.currentTabIndex || -1;
            console.log("Tab history loaded from storage: ", tabHistory);
            console.log("Current tab index loaded from storage: ", currentTabIndex);
            resolve();
        });
    });
};

/** Initializes the extension by loading the tab history from storage. */
const initializeExtension = async () => {
    loadingHistory = true;
    await loadHistoryFromStorage();
    loadingHistory = false;
};

/** Returns true if the tab should be ignored from the history.
 * @param {number} tabId
 * @returns {boolean}
 * */
const shouldIgnoreTab = (tabId) => {
    if (loadingHistory) return true;
    let result = ignoreNextActivatedEvent || tabId === chrome.tabs.TAB_ID_NONE;
    ignoreNextActivatedEvent = false;

    if (tabHistory.length > 0 && tabId === tabHistory[0].tabId) {
        result = true;
    }
    return result;
}

/** Adds the tab to the history.
 * @param {number} tabId
 * */
const addTabToHistory = async (tabId) => {
    if (shouldIgnoreTab(tabId)) return;
    if (currentTabIndex !== 0) {
        console.log("Clearing history after current tab index.");
        tabHistory = tabHistory.slice(currentTabIndex);
        currentTabIndex = 0;
    }
    try {
        const tab = await getTabById(tabId);
        tabHistory.unshift(tab);
        updateData();
        console.log(`Tab ${tabId} added to history.`);
    } catch (error) {
        console.error(`Failed to add tab to history: ${error}`);
    }
};

/** Clears the tab history. */
const clearTabHistory = () => {
    tabHistory = [];
    currentTabIndex = -1;
    updateData();
};

/** Opens the tab with the given tabId.
 * Verifies if the tab exists before opening it.
 * @param {number} tabId
 * @returns {Promise<boolean>}
 * */
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

/** Opens the tab with the given index in the history.
 * @param {number} index
 * */
const openTabByIndex = async (index) => {
    if (index < 0 || index >= tabHistory.length) {
        return;
    }
    const tab = tabHistory[index];
    console.log(`Opening tab ${tab.tabId} by index ${index}`);
    let success = await openTab(tab?.tabId);
    if (!success) {
        tabHistory.splice(index, 1);
        await openTabByIndex(index);
    }
}

/** Gets the tab information by tabId.
 * @param {number} tabId
 * @returns {Promise<{tabId: number, title: string}>}
 * */
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

/** Sets the currentTabIndex and opens the tab with the given index in the history. */
const setCurrentTabIndex = (index) => {
    if (loadingHistory) return;
    currentTabIndex = index;
    openTabByIndex(index);
    updateData();
};

/** Goes to the previous tab in the history. */
const goBack = async () => {
    if (loadingHistory) return;
    if (currentTabIndex < tabHistory.length - 1) {
        const previousTab = tabHistory[currentTabIndex];
        currentTabIndex++;
        const newTab = tabHistory[currentTabIndex];
        console.log(`Going back to tab ${newTab.tabId}`);
        let success = await openTab(newTab.tabId);
        if (!success || previousTab.tabId === newTab.tabId) {
            tabHistory.splice(currentTabIndex, 1);
            currentTabIndex--;
            await goBack();
        }
    }
    updateData();
};

/** Goes to the next tab in the history. */
const goForward = async () => {
    if (loadingHistory) return;
    if (currentTabIndex > 0) {
        const previousTab = tabHistory[currentTabIndex];
        currentTabIndex--;
        const newTab = tabHistory[currentTabIndex];
        console.log(`Going forward to tab ${newTab.tabId}`);
        let success = await openTab(newTab.tabId);
        if (!success || previousTab?.tabId === newTab?.tabId) {
            tabHistory.splice(currentTabIndex, 1);
            await goForward();
        }
    }
    updateData();
};

/** Updates the tab history and currentTabIndex in storage and sends a message to the popup.js to update the data. */
const updateData = async () => {
    let data = { history: tabHistory, currentTabIndex: currentTabIndex };
    try {
        await chrome.storage.local.set(data);
        console.log("Data successfully saved to local storage.");
    } catch (error) {
        console.error("Failed to save data to local storage: ", error);
        return;
    }
};

chrome.runtime.onStartup.addListener(async () => {
    await initializeExtension();
});

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        console.log("Extension installed for the first time.");
        tabHistory = [];
        currentTabIndex = -1;
        await updateData();
    } else if (details.reason === "update") {
        console.log("Extension updated to new version.");
    }
    await initializeExtension();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        await initializeExtension();
    }
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

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await addTabToHistory(activeInfo.tabId);
    console.log(`Tab ${activeInfo.tabId} is now active.`);
});

chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
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

