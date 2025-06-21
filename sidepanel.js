const cssInput = document.getElementById("css-input");
const injectCssBtn = document.getElementById("inject-css-btn");
const htmlInput = document.getElementById("html-input");
const injectHtmlBtn = document.getElementById("inject-html-btn");
const jsInput = document.getElementById("js-input");
const executeJsBtn = document.getElementById("execute-js-btn");

const extractCssBtn = document.getElementById("extract-css-btn");
const extractHtmlBtn = document.getElementById("extract-html-btn");
const extractBothBtn = document.getElementById("extract-both-btn");

const magicInput = document.getElementById("magic");
const magicButton = document.getElementById("backend-ui-btn");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

injectCssBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  const cssCode = cssInput.value;
  if (tab?.id && cssCode) {
    chrome.scripting.insertCSS({ target: { tabId: tab.id }, css: cssCode });
  }
});

injectHtmlBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  const htmlCode = htmlInput.value;
  if (tab?.id && htmlCode) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (html) => {
        document.body.insertAdjacentHTML("beforeend", html);
      },
      args: [htmlCode],
    });
  }
});

executeJsBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const jsCode = jsInput.value.trim();
  if (!jsCode) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [jsCode],
      func: (code) => {
        try {
          const result = window.eval(code);
          console.log("[Side-panel] JS execution result:", result);
        } catch (err) {
          console.error("[Side-panel] JS execution error:", err);
        }
      },
    });
  } catch (e) {
    console.error("Unable to inject script:", e);
  }
});

// --- Extraction Listeners (Unchanged) ---

extractCssBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (tab?.id) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractAuthoredCSSInPage,
      });
      const extractedCSS = results[0].result;
      cssInput.value = extractedCSS;
      console.log("✅ CSS extracted successfully!");
    } catch (error) {
      console.error("❌ Error extracting CSS:", error);
    }
  }
});

extractHtmlBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (tab?.id) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractHTMLInPage,
      });
      const extractedHTML = results[0].result;
      htmlInput.value = extractedHTML;
      console.log("✅ HTML extracted successfully!");
    } catch (error) {
      console.error("❌ Error extracting HTML:", error);
    }
  }
});

extractBothBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (tab?.id) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractBothInPage,
      });
      const { css, html } = results[0].result;
      cssInput.value = css;
      htmlInput.value = html;
      console.log("✅ Both CSS and HTML extracted successfully!");
    } catch (error) {
      console.error("❌ Error extracting CSS and HTML:", error);
    }
  }
});

async function handleMagicChange() {
  console.log("🪄 Magic button clicked. Starting process...");
  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      console.error("❌ Could not get active tab.");
      return;
    }

    const userQuery = magicInput.value.trim();
    if (!userQuery) {
      alert("Please enter a query in the 'Magic' textarea.");
      console.warn("⚠️ User query is empty. Aborting.");
      return;
    }
    console.log(`[LOG] User Query: "${userQuery}"`);

    console.log("[LOG] Extracting current HTML and CSS from the page...");
    const extractResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractBothInPage,
    });

    // Fixed: Check for extractResults[0] instead of duplicate extractResults check
    if (!extractResults || !extractResults[0] || !extractResults[0].result) {
      throw new Error("Failed to extract HTML/CSS from the page.");
    }

    const { html: html_code, css: css_code } = extractResults[0].result;

    console.log("[LOG] Extracted page content. Sending to backend...");
    const response = await fetch("http://localhost:8080/extention/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        website_url: tab.url,
        html_code,
        css_code,
        user_query: userQuery,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Backend request failed with status ${response.status}: ${errorText}`,
      );
    }

    const responseData = await response.json();
    console.log("[LOG] Backend response:", responseData);

    // UPDATED: Expect an array of changes in the 'change' property
    const changes = responseData?.state?.change;

    if (!Array.isArray(changes) || changes.length === 0) {
      console.warn("⚠️ No valid changes array received from backend", changes);
      alert("No changes were generated. Please try a different query.");
      return;
    }

    console.log(`[LOG] Applying ${changes.length} change parts to the page...`);

    // UPDATED: Loop through the array and apply each change sequentially.
    for (const change of changes) {
      // Add defensive checks for the change object structure
      if (!change || typeof change !== "object") {
        console.warn("⚠️ Invalid change object received:", change);
        continue;
      }

      const codeToExecute = change.code;
      const codeType = change.type;

      // Check if required properties exist
      if (!codeToExecute || typeof codeToExecute !== "string") {
        console.warn("⚠️ Invalid or missing Code property in change:", change);
        continue;
      }

      if (!codeType || typeof codeType !== "string") {
        console.warn("⚠️ Invalid or missing Type property in change:", change);
        continue;
      }

      console.log(
        `[LOG] -> Applying part: type='${codeType}', length=${codeToExecute.length}`,
      );

      switch (codeType) {
        case "javascript":
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: (jsCode) => {
              try {
                eval(jsCode);
              } catch (e) {
                console.error("Error executing JS part:", e);
              }
            },
            args: [codeToExecute],
          });
          break;

        case "css":
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: (cssString) => {
              // ensure we have exactly one style element that we can overwrite
              const STYLE_ID = "__web_code_injector_css__";
              let tag = document.getElementById(STYLE_ID);
              if (!tag) {
                tag = document.createElement("style");
                tag.id = STYLE_ID;
                tag.type = "text/css";
                document.head.appendChild(tag);
              }

              /* Always append at the end so we win the cascade.
                 We overwrite, not concatenate, so that re-running the
                 “Magic” button replaces old rules instead of duplicating them. */
              tag.textContent = cssString;
            },
            args: [codeToExecute],
          });
          break;
        case "html":
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (html) => {
              document.body.insertAdjacentHTML("beforeend", html);
            },
            args: [codeToExecute],
          });
          break;

        default:
          console.warn(`Unknown change type '${codeType}' received. Skipping.`);
      }
    }

    console.log("✅ All magic changes applied successfully!");
  } catch (error) {
    console.error("❌ Error during magic change:", error);
    alert(
      "An error occurred during the magic change. Check the console for details.",
    );
  }
}

magicButton.addEventListener("click", handleMagicChange);

function extractHTMLInPage() {
  return document.body.innerHTML;
}

async function extractAuthoredCSSInPage() {
  let allCSS = "";
  try {
    const styleElements = document.querySelectorAll("style");
    styleElements.forEach((style) => {
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

async function extractBothInPage() {
  const html = document.body.innerHTML; // Extracting body's HTML

  let allCSS = "";
  try {
    const styleElements = document.querySelectorAll("style");
    styleElements.forEach((style) => {
      if (style.textContent) {
        allCSS += `/* --- Inline Style --- */\n${style.textContent.trim()}\n\n`;
      }
    });

    const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of linkElements) {
      try {
        const response = await fetch(link.href, { credentials: "omit" });
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

  return { css: allCSS, html: html };
}
