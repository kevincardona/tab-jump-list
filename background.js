// background.js

const TAB_HISTORY_LIMIT = 1000;

/** Locks the command execution to prevent multiple commands from executing at the same time. */
let commandLock = false;

/** Command queue to handle commands sequentially */
let commandQueue = [];

/** Map to keep track of programmatic tab changes. */
let programmaticChanges = new Map();

/** Adds a command to the queue and starts execution if not already running. */
const addCommandToQueue = (command) => {
    commandQueue.push(command);
    if (!commandLock) {
        executeNextCommand();
    }
};

/** Executes the next command in the queue. */
const executeNextCommand = async () => {
    if (commandQueue.length === 0) {
        commandLock = false;
        return;
    }

    commandLock = true;
    const nextCommand = commandQueue.shift();
    try {
        await nextCommand();
    } catch (error) {
        console.error(`Failed to execute command: ${error}`);
    } finally {
        commandLock = false;
        executeNextCommand();
    }
};

/** Saves the tab history and index to storage.
 * @param {Object} data
 * @param {number} data.tabHistoryIndex - The index of the current tab in the history.
 * @param {Array<number>} data.tabHistory - The tab history.
 * */
const saveExtensionData = (data) => {
    return chrome.storage.local.set(data);
}

/** Loads the tab history from storage.
 * @returns {Promise<{tabHistoryIndex: number, tabHistory: Array<number>}>}
 * */
const loadExtensionData = () => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['tabHistoryIndex', 'tabHistory'])
            .then(({ tabHistoryIndex, tabHistory }) => {
                resolve({ tabHistoryIndex, tabHistory });
            })
            .catch((error) => {
                reject(error);
            })
    })
};


/** Adds the tab to the history.
 * @param {number} id
 * */
const addTabToHistory = async (id) => {
    try {
        if (programmaticChanges.has(id) && programmaticChanges.get(id) > 0) {
            console.debug("Programmatic tab change detected, not adding to history.");
            programmaticChanges.set(id, programmaticChanges.get(id) - 1);
            return;
        }

        let { tabHistoryIndex, tabHistory } = await loadExtensionData();
        if (tabHistoryIndex === -1 && tabHistory.length > 0) {
            tabHistoryIndex = 0;
        }

        if (tabHistory.length > tabHistoryIndex && id === tabHistory[tabHistoryIndex]) {
            console.debug("Ignoring tab because it is already in history.");
            return;
        }

        console.debug(`Adding tab ${id} to history.`);

        if (tabHistoryIndex !== 0) {
            console.debug("Clearing history after current tab index.");
            tabHistory = tabHistory.slice(tabHistoryIndex);
            tabHistoryIndex = 0;
        }

        const result = await chrome.tabs.get(id);

        const tab = { id: result.id, title: result.title || `${result.id} (no title)`, favIconUrl: result.favIconUrl };

        tabHistory.unshift(tab);

        if (tabHistory.length > TAB_HISTORY_LIMIT) {
            tabHistory = tabHistory.slice(0, TAB_HISTORY_LIMIT);
        }

        await saveExtensionData({ tabHistoryIndex, tabHistory });
    } catch (error) {
        console.error(`Failed to add tab to history: ${error}`);
    }
};

/** Removes the tab from the history.
 * @param {number} id
 * */
const removeTabFromHistory = async (id) => {
    let { tabHistoryIndex, tabHistory } = await loadExtensionData();
    const index = tabHistory.findIndex(tab => tab.id === id);
    if (index !== -1) {
        tabHistory = tabHistory.filter(tab => tab.id !== id);
        if (index < tabHistoryIndex) {
            tabHistoryIndex--;
        }
        await saveExtensionData({ tabHistoryIndex, tabHistory });
    }
}

/** Clears the tab history. */
const clearTabHistory = async () => {
    try {
        let { tabHistoryIndex, tabHistory } = await loadExtensionData();
        if (tabHistoryIndex !== -1 && tabHistory.length > 0) {
            const currentTab = tabHistory[tabHistoryIndex];
            tabHistory = [currentTab];
            tabHistoryIndex = 0;
        } else {
            tabHistoryIndex = -1;
            tabHistory = [];
        }
        return saveExtensionData({ tabHistoryIndex, tabHistory })
    } catch (error) {
        console.error(`Failed to clear tab history: ${error}`);
    }
}

/** Opens the tab with the given index in the history.
 * @param {number} index
 * @param {number} direction - The direction to move in the history.
 * */
const openTabByIndex = async (index, extensionData = undefined) => {
    try {
        console.debug(`Opening tab by index ${index}`);
        let { tabHistory } = extensionData ? extensionData : await loadExtensionData();
        if (index < 0 || index >= tabHistory.length) {
            console.debug(`Index ${index} is out of bounds. Ignoring openTabByIndex request.`);
            return false;
        }

        const tabId = tabHistory[index].id;

        if (!programmaticChanges.has(tabId)) {
            programmaticChanges.set(tabId, 0);
        }
        programmaticChanges.set(tabId, programmaticChanges.get(tabId) + 1);

        await chrome.tabs.update(tabId, { active: true });
        await saveExtensionData({ tabHistoryIndex: index, tabHistory });
        console.debug(`Tab ${tabId} opened.`);
        return true;
    } catch (error) {
        console.error(`Failed to open tab by index: ${error}`);
        return false;
    }
}

/** Updates the tab info (title and favicon URL) in the history.
 * @param {number} id - The tab id.
 * @param {Object} changes - The changes to the tab.
 * @param {string} [changes.title] - The new title of the tab.
 * @param {string} [changes.favIconUrl] - The new favicon URL of the tab.
 */
const updateTabInfo = async (id, changes) => {
    try {
        console.debug(`Updating tab info for tab ${id}`);
        let { tabHistoryIndex, tabHistory } = await loadExtensionData();
        const index = tabHistory.findIndex(tab => tab.id === id);
        if (index !== -1) {
            if (changes.title) {
                tabHistory[index].title = changes.title;
            }
            if (changes.favIconUrl) {
                tabHistory[index].favIconUrl = changes.favIconUrl;
            }
            await saveExtensionData({ tabHistoryIndex, tabHistory });
        }
    } catch (error) {
        console.error(`Failed to update tab info in history: ${error}`);
    }
};

/** Goes to the previous tab in the history. */
const goBack = async (offset = 1) => {
    try {
        console.debug("Going back in history.");
        const extensionData = await loadExtensionData();
        let { tabHistoryIndex, tabHistory } = extensionData
        if (tabHistoryIndex + offset > tabHistory.length - 1) {
            console.debug("No more tabs in history.");
            return;
        }
        const success = await openTabByIndex(tabHistoryIndex + offset, extensionData);
        if (!success) {
            await goBack(++offset);
        }
    } catch (error) {
        console.error(`Failed to go back: ${error}`);
    }
};

/** Goes to the next tab in the history. */
const goForward = async (offset = 1) => {
    try {
        console.debug("Going forward in history.");
        const extensionData = await loadExtensionData();
        let { tabHistoryIndex } = extensionData;
        if (tabHistoryIndex <= 0) {
            console.debug("No more tabs ahead.");
            return;
        }
        const success = await openTabByIndex(tabHistoryIndex - offset, extensionData);
        if (!success) {
            await goForward(++offset);
        }
    } catch (error) {
        console.error(`Failed to go forward: ${error}`);
    }
}

/** Cleans up the tab history by removing tabs that are no longer open. */
const cleanupMissingTabs = async () => {
    try {
        let { tabHistoryIndex, tabHistory } = await loadExtensionData();
        const tabs = await chrome.tabs.query({});
        const tabIds = tabs.map(tab => tab.id);
        tabHistory = tabHistory.filter(tab => tabIds.includes(tab.id));
        await saveExtensionData({ tabHistoryIndex, tabHistory });
    } catch (error) {
        console.error(`Failed to clean up missing tabs: ${error}`);
    }
}

/** Locks the command execution to prevent multiple commands from executing at the same time.
 * This is useful because the state is shared between all commands.
 * @param {function} cb - The callback function to execute.
 * */
const lock = (cb) => {
    return async (...args) => {
        addCommandToQueue(async () => {
            console.debug("Command lock acquired.");
            try {
                await cb(...args);
            } catch (error) {
                console.error(`Failed to execute command: ${error}`);
            } finally {
                console.debug("Command lock released.");
            }
        });
    }
}

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        console.debug("Extension installed for the first time.");
        lock(async () => {
            chrome.storage.local.set({ tabHistoryIndex: -1, tabHistory: [] })
        })();
    } else if (details.reason === "update") {
        console.debug("Extension updated to new version.");
        console.debug(`Previous version: ${details.previousVersion}`);
    }
});

chrome.runtime.onStartup.addListener(lock(async () => {
    await cleanupMissingTabs();
}));

chrome.commands.onCommand.addListener(lock(async (command) => {
    console.debug(`Command ${command} received.`);
    switch (command) {
        case "go-back":
            await goBack();
            break;
        case "go-forward":
            await goForward();
            break;
    }
}));

chrome.tabs.onActivated.addListener(lock(async (activeInfo) => {
    console.debug(`Tab ${JSON.stringify(activeInfo)} activated.`);
    await addTabToHistory(activeInfo.tabId);
}));

chrome.tabs.onRemoved.addListener(lock(async (tabId) => {
    console.debug(`Tab ${tabId} removed.`);
    await removeTabFromHistory(tabId);
}));

chrome.tabs.onUpdated.addListener(lock(async (tabId, changeInfo) => {
    if (changeInfo.title || changeInfo.favIconUrl) {
        console.debug(`Tab ${tabId} updated. Changes: ${JSON.stringify(changeInfo)}`);
        await updateTabInfo(tabId, changeInfo);
    }
}));

chrome.runtime.onMessage.addListener(lock(async (request) => {
    console.debug(`Message received: ${request.action}`);
    switch (request.action) {
        case "openTab":
            await openTabByIndex(request.index);
            break;
        case "clearTabHistory":
            await clearTabHistory();
            console.debug("Tab history cleared.");
            break;
    }
}));
