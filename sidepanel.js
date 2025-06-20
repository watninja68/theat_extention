const cssInput = document.getElementById('css-input');
const injectCssBtn = document.getElementById('inject-css-btn');
const htmlInput = document.getElementById('html-input');
const injectHtmlBtn = document.getElementById('inject-html-btn');
const jsInput = document.getElementById('js-input');
const executeJsBtn = document.getElementById('execute-js-btn');

const extractCssBtn = document.getElementById('extract-css-btn');
const extractHtmlBtn = document.getElementById('extract-html-btn');
const extractBothBtn = document.getElementById('extract-both-btn');

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

// ... (all your other event listeners for inject/execute are fine) ...
injectCssBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    const cssCode = cssInput.value;
    if (tab?.id && cssCode) {
        chrome.scripting.insertCSS({ target: { tabId: tab.id }, css: cssCode });
    }
});

injectHtmlBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    const htmlCode = htmlInput.value;
    if (tab?.id && htmlCode) {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (html) => {
                document.body.insertAdjacentHTML('beforeend', html);
            },
            args: [htmlCode]
        });
    }
});

executeJsBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const jsCode = jsInput.value.trim();
  if (!jsCode) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [jsCode],
      func: code => {
        try {
          const result = window.eval(code);
          console.log("[Side-panel] result:", result);
        } catch (err) {
          console.error("[Side-panel] error:", err);
        }
      }
    });
  } catch (e) {
    console.error("Unable to inject script:", e);
  }
});

// Event listener for extracting CSS (This is fine)
extractCssBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (tab?.id) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractAuthoredCSSInPage
            });
            const extractedCSS = results[0].result;
            cssInput.value = extractedCSS;
            console.log('✅ CSS extracted successfully!');
        } catch (error) {
            console.error('❌ Error extracting CSS:', error);
        }
    }
});

// Event listener for extracting HTML (This is fine)
extractHtmlBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (tab?.id) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractHTMLInPage
            });
            const extractedHTML = results[0].result;
            htmlInput.value = extractedHTML;
            console.log('✅ HTML extracted successfully!');
        } catch (error) {
            console.error('❌ Error extracting HTML:', error);
        }
    }
});

// Event listener for extracting both CSS and HTML (This is fine)
extractBothBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (tab?.id) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractBothInPage // Now injects the fixed, self-contained function
            });
            const { css, html } = results[0].result;
            cssInput.value = css;
            htmlInput.value = html;
            console.log('✅ Both CSS and HTML extracted successfully!');
        } catch (error) {
            console.error('❌ Error extracting CSS and HTML:', error);
        }
    }
});


//--- Content Script Functions ---
// These functions are NOT called directly. They are serialized and executed in the target tab.

function extractHTMLInPage() {
    return document.documentElement.outerHTML;
}

async function extractAuthoredCSSInPage() {
    let allCSS = '';
    try {
        const styleElements = document.querySelectorAll('style');
        styleElements.forEach(style => {
            allCSS += `/* --- Inline Style --- */\n${style.textContent}\n\n`;
        });

        const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
        for (const link of linkElements) {
            try {
                const response = await fetch(link.href);
                const cssText = await response.text();
                allCSS += `/* --- External Stylesheet: ${link.href} --- */\n${cssText}\n\n`;
            } catch (error) {
                allCSS += `/* --- Could not fetch: ${link.href} (${error.message}) --- */\n\n`;
            }
        }
        return allCSS;
    } catch (error) {
        return `/* --- Error extracting CSS: ${error.message} --- */`;
    }
}

// ===================================================================
// FIXED FUNCTION
// ===================================================================
async function extractBothInPage() {
    // 1. Get the HTML first
    const html = document.documentElement.outerHTML;

    // 2. Now, include the full CSS extraction logic directly inside this function
    let allCSS = '';
    try {
        // Extract inline <style> tags
        const styleElements = document.querySelectorAll('style');
        styleElements.forEach(style => {
            if (style.textContent) {
                 allCSS += `/* --- Inline Style --- */\n${style.textContent.trim()}\n\n`;
            }
        });

        // Extract external stylesheets by fetching them
        const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
        for (const link of linkElements) {
            try {
                const response = await fetch(link.href, {credentials: 'omit'}); // Use fetch to get content
                if (response.ok) {
                    const cssText = await response.text();
                    allCSS += `/* --- External Stylesheet: ${link.href} --- */\n${cssText}\n\n`;
                } else {
                     allCSS += `/* --- Could not fetch stylesheet (status: ${response.status}): ${link.href} --- */\n\n`;
                }
            } catch (error) {
                allCSS += `/* --- Could not fetch stylesheet (network error): ${link.href} --- */\n\n`;
            }
        }
    } catch (error) {
        allCSS = `/* Error during CSS extraction: ${error.message} */`;
    }

    // 3. Return both as a single object
    return { css: allCSS, html: html };
}
