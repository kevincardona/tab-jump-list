// background.js

let currentTabIndex = -1;
let history = [];
let historyLoaded = false;

// Locking variables
let loadingHistory = false;
let ignoreNextActivatedEvent = false;
let commandLock = false;

/** Loads the tab history from storage. */
const loadHistory = async () => {
    try {
        console.log("Loading tab history from storage...");
        const result = await chrome.storage.local.get(['history', 'currentTabIndex']);
        history = result.history || [];
        currentTabIndex = result.currentTabIndex || -1;
        historyLoaded = true;
        console.log("Tab history loaded from storage: ", history);
    } catch (error) {
        console.error("Failed to load tab history from storage: ", error);
    }
};

/** Initializes the extension by loading the tab history from storage. */
const initializeExtension = async () => {
    if (historyLoaded) return;
    loadingHistory = true;
    try {
        await loadHistory();
    } catch (error) {
        console.error("Failed to initialize extension: ", error);
    } finally {
        loadingHistory = false;
    }
};

/** Returns true if the tab should be ignored from the history.
 * @param {number} tabId
 * @returns {boolean}
 * */
const shouldIgnoreTab = (tabId) => {
    // Chrome loses state when defocused for long enough, so we need to reload the history here
    if (!historyLoaded && !loadingHistory) {
        console.log("Ignoring tab because history is not loaded and not loading. Initiating load.");
        loadHistory();
        return true;
    }
    if (loadingHistory) {
        console.log("Ignoring tab because history is still loading.");
        return true;
    }
    if (ignoreNextActivatedEvent) {
        console.log("Ignoring tab because of ignoreNextActivatedEvent.");
        ignoreNextActivatedEvent = false;
        return true;
    }
    if (tabId === chrome.tabs.TAB_ID_NONE) {
        console.log("Ignoring tab because it is not a valid tab.");
        return true;
    }
    if (history.length > 0 && tabId === history[0].tabId) {
        console.log("Ignoring tab because it is already in history.");
        return true;
    }
    return false;
};

/** Adds the tab to the history.
 * @param {number} tabId
 * */
const addTabToHistory = async (tabId) => {
    if (shouldIgnoreTab(tabId)) return;
    if (currentTabIndex !== 0) {
        console.log("Clearing history after current tab index.");
        history = history.slice(currentTabIndex);
        currentTabIndex = 0;
    }
    try {
        const tab = await getTabById(tabId);
        history.unshift(tab);
        await updateData();
        console.log(`Tab ${tabId} added to history.`);
    } catch (error) {
        console.error(`Failed to add tab to history: ${error}`);
    }
};

/** Clears the tab history. */
const clearTabHistory = async () => {
    history = [];
    currentTabIndex = -1;
    await updateData();
};

/** Opens the tab with the given tabId.
 * Verifies if the tab exists before opening it.
 * @param {number} tabId
 * @returns {boolean}
 * */
const openTab = async (tabId) => {
    try {
        console.log(`Opening tab ${tabId}`);
        ignoreNextActivatedEvent = true;
        await chrome.tabs.update(tabId, { active: true });
        console.log(`Tab ${tabId} opened.`);
        return true;
    } catch (error) {
        console.log(`Tab ${tabId} does not exist. Ignoring openTab request.`);
        return false;
    }
};

/** Opens the tab with the given index in the history.
 * @param {number} index
 * */
const openTabByIndex = async (index) => {
    if (index < 0 || index >= history.length) {
        console.log(`Index ${index} is out of bounds. Ignoring openTabByIndex request.`);
        return;
    }
    const tab = history[index];
    console.log(`Opening tab ${tab.tabId} by index ${index}`);
    let success = await openTab(tab?.tabId);
    if (!success) {
        console.log(`Failed to open tab ${tab.tabId}. Removing from history.`);
        history.splice(index, 1);
        await openTabByIndex(index);
    }
}

/** Gets the tab information by tabId.
 * @param {number} tabId
 * @returns {{tabId: number, title: string}}
 * */
const getTabById = async (tabId) => {
    try {
        const tab = await chrome.tabs.get(tabId);
        return { tabId: tab.id, title: tab.title || `${tab.id} (no title)` };
    } catch (error) {
        throw new Error(error.message);
    }
};

/** Sets the currentTabIndex and opens the tab with the given index in the history. */
const setCurrentTabIndex = async (index) => {
    if (loadingHistory) {
        console.log("Loading history. Ignoring setCurrentTabIndex request.");
        return;
    }
    currentTabIndex = index;
    await openTabByIndex(index);
    await updateData();
};

/** Goes to the previous tab in the history. */
const goBack = async () => {
    if (loadingHistory) {
        console.log("Loading history. Ignoring goBack request.");
        return;
    }
    if (currentTabIndex === -1 && history.length > 0) {
        currentTabIndex = 0;

    }
    if (currentTabIndex < history.length - 1 && currentTabIndex >= 0) {
        const previousTab = history[currentTabIndex];
        currentTabIndex++;
        console.log(`Going back to index ${currentTabIndex}`);
        const newTab = history[currentTabIndex];
        console.log(`Going back to tab ${newTab.tabId}`);
        let success = await openTab(newTab.tabId);
        if (!success || previousTab.tabId === newTab.tabId) {
            console.log(`Failed to open tab ${newTab.tabId}. Removing from history.`);
            history.splice(currentTabIndex, 1);
            currentTabIndex--;
            await goBack();
        } else {
            await updateData();
        }
    }
};

/** Goes to the next tab in the history. */
const goForward = async () => {
    if (loadingHistory) {
        console.log("Loading history. Ignoring goForward request.");
        return;
    }
    if (currentTabIndex > 0) {
        const previousTab = history[currentTabIndex];
        currentTabIndex--;
        console.log(`Going forward to index ${currentTabIndex}`);
        const newTab = history[currentTabIndex];
        console.log(`Going forward to tab ${newTab.tabId}`);
        let success = await openTab(newTab.tabId);
        if (!success || previousTab.tabId === newTab.tabId) {
            console.log(`Failed to open tab ${newTab.tabId}. Removing from history.`);
            history.splice(currentTabIndex, 1);
            await goForward();
        } else {
            await updateData();
        }
    }
};

/** Updates the tab history and currentTabIndex in storage and sends a message to the popup.js to update the data. */
const updateData = async () => {
    if (!historyLoaded) {
        console.log("Ignoring updateData request because history is not loaded.");
        return;
    }
    let data = { history: history, currentTabIndex: currentTabIndex };
    console.log("Updating data: ", data);
    try {
        await chrome.storage.local.set(data);
        console.log("Data successfully saved to local storage.");
    } catch (error) {
        console.error("Failed to save data to local storage: ", error);
    }
};

// Event listeners

chrome.runtime.onStartup.addListener(async () => {
    await initializeExtension();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        await initializeExtension();
    }
});

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        console.log("Extension installed for the first time.");
        history = [];
        currentTabIndex = -1;
        await updateData();
    } else if (details.reason === "update") {
        console.log("Extension updated to new version.");
    }
    await initializeExtension();
});

chrome.commands.onCommand.addListener(async (command) => {
    await initializeExtension();
    if (commandLock) {
        console.log("Command lock is active. Ignoring command.");
        return;
    }
    try {
        commandLock = true;
        switch (command) {
            case "go-back":
                await goBack();
                break;
            case "go-forward":
                await goForward();
                break;
        }
    } finally {
        commandLock = false;
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await initializeExtension();
    await addTabToHistory(activeInfo.tabId);
    console.log(`Tab ${activeInfo.tabId} is now active.`);
});

chrome.runtime.onMessage.addListener(async (request) => {
    await initializeExtension();
    switch (request.action) {
        case "openTab":
            await setCurrentTabIndex(request.index);
            break
        case "clearTabHistory":
            clearTabHistory();
            break;
    }
});

