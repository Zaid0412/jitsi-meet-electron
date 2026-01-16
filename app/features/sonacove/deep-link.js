const { app, BrowserWindow } = require('electron');
const path = require('path');

const sonacoveConfig = require('./config');

let macDeepLinkUrl = null;
let pendingStartupDeepLink = null;

/**
 * Finds the main visible application window to receive deep link events.
 *
 * @returns {BrowserWindow|undefined} The main visible window.
 */
function getMainWindow() {
    const windows = BrowserWindow.getAllWindows();

    return windows.find(w => !w.isDestroyed() && w.isVisible());
}

/**
 * Registers the custom protocol scheme for the application.
 *
 * @returns {void}
 */
function registerProtocol() {
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient('sonacove', process.execPath, [ path.resolve(process.argv[1]) ]);
        }
    } else {
        app.setAsDefaultProtocolClient('sonacove');
    }
}

/**
 * Sets up the listener for the macOS open-url event.
 *
 * @returns {void}
 */
function setupMacDeepLinkListener() {
    app.on('open-url', (event, url) => {
        event.preventDefault();
        macDeepLinkUrl = url;
        const win = getMainWindow();

        if (win) {
            navigateDeepLink(url);
        }
    });
}

/**
 * Processes any deep link arguments provided during application startup.
 *
 * @returns {void}
 */
function processDeepLinkOnStartup() {
    if (process.platform === 'win32' || process.platform === 'linux') {
        const url = process.argv.find(arg => arg.startsWith('sonacove://'));

        if (url) {
            pendingStartupDeepLink = url;
        }
    }
    if (macDeepLinkUrl) {
        pendingStartupDeepLink = macDeepLinkUrl;
        macDeepLinkUrl = null;
    }
}

/**
 * Navigates the application based on the provided deep link.
 * Handles auth callbacks, logout, and standard navigation.
 *
 * @param {string} deepLink - The deep link URL to process.
 * @returns {boolean} Success status.
 */
function navigateDeepLink(deepLink) {
    // 1. Handle Auth Callback
    if (deepLink.includes('auth-callback')) {
        handleAuthCallback(deepLink);

        return true;
    }

    // 2. Handle Logout
    if (deepLink.includes('logout-callback')) {
        const win = getMainWindow();

        if (win) {
            if (win.isMinimized()) {
                win.restore();
            }
            win.focus();
            setTimeout(() => {
                win.webContents.send('auth-logout-complete');
            }, 500);
        }

        return true;
    }

    // 3. Handle Standard Navigation
    try {
        let rawPath = deepLink.replace('sonacove://', '');

        if (rawPath.startsWith('/')) {
            rawPath = rawPath.substring(1);
        }
        if (rawPath.endsWith('/')) {
            rawPath = rawPath.slice(0, -1);
        }

        // Check if this is a meeting link
        if (rawPath.startsWith('meet/')) {
            // For explicit meeting links, use the meetRoot config
            const meetPath = rawPath.replace('meet/', '');
            const meetRoot = sonacoveConfig.currentConfig.meetRoot;

            // Remove trailing slash from meetRoot if it exists
            const cleanMeetRoot = meetRoot.endsWith('/') ? meetRoot.slice(0, -1) : meetRoot;

            // Construct final URL
            const targetUrl = `${cleanMeetRoot}/${meetPath}`;

            const win = getMainWindow();

            if (win) {
                win.loadURL(targetUrl);
                if (win.isMinimized()) {
                    win.restore();
                }
                win.focus();

                return true;
            }

            return false;

        }

        // Treat any other non-empty path as a meeting room
        if (rawPath && rawPath !== '' && !rawPath.includes('auth-callback') && !rawPath.includes('logout-callback')) {
            const meetRoot = sonacoveConfig.currentConfig.meetRoot;
            const cleanMeetRoot = meetRoot.endsWith('/') ? meetRoot.slice(0, -1) : meetRoot;
            const targetUrl = `${cleanMeetRoot}/${rawPath}`;

            const win = getMainWindow();

            if (win) {
                win.loadURL(targetUrl);
                if (win.isMinimized()) {
                    win.restore();
                }
                win.focus();

                return true;
            }

            return false;
        }

        // For empty paths or other cases, use the landing URL
        const landingUrl = sonacoveConfig.currentConfig.landing;
        const targetUrl = landingUrl;

        const win = getMainWindow();

        if (win) {
            win.loadURL(targetUrl);
            if (win.isMinimized()) {
                win.restore();
            }
            win.focus();

            return true;
        }

        return false;


    } catch (error) {
        console.error('Error parsing deep link:', error);

        return false;
    }
}

/**
 * Handles the authentication callback from the deep link.
 * Extracts user data and sends it to the renderer process.
 *
 * @param {string} deepLink - The auth callback URL.
 * @returns {void}
 */
function handleAuthCallback(deepLink) {
    try {
        // Hack to use URL parser with non-standard protocol
        const urlStr = deepLink.replace('sonacove://', 'https://');
        const urlObj = new URL(urlStr);
        const payload = urlObj.searchParams.get('payload');

        if (payload) {
            const user = JSON.parse(decodeURIComponent(payload));
            const win = getMainWindow();

            if (win) {
                // Focus first to ensure execution priority
                if (win.isMinimized()) {
                    win.restore();
                }
                win.focus();

                // Send the data
                win.webContents.send('auth-token-received', user);
            }
        }
    } catch (e) {
        console.error('Auth Parsing Error', e);
    }
}

module.exports = {
    registerProtocol,
    setupMacDeepLinkListener,
    processDeepLinkOnStartup,
    navigateDeepLink
};
