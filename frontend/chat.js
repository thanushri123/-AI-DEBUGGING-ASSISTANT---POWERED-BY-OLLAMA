// --------------------------------------------------
// DOM Elements
// --------------------------------------------------
const chatContainer = document.getElementById("chat-container");
const inputBox = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const modelSelect = document.getElementById("model-select");

let lastModelUsed = modelSelect.value;

// --------------------------------------------------
// Scroll
// --------------------------------------------------
function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// --------------------------------------------------
// User Message
// --------------------------------------------------
function addUserMessage(text) {
    const div = document.createElement("div");
    div.className = "msg msg-user";
    div.innerText = text;
    chatContainer.appendChild(div);
    scrollToBottom();
}

// --------------------------------------------------
// System Note (Model Switching)
//   -> uses plain .robot (NO blinking)
// --------------------------------------------------
function addSystemNote(text, withLoader = false) {
    const div = document.createElement("div");
    div.className = "msg msg-system";

    let html = `<i>${text}</i>`;

    if (withLoader) {
        html += `
            <div class="loading-bar">
                <div class="loading-fill"></div>
            </div>
        `;
    }

    div.innerHTML = html;
    chatContainer.appendChild(div);
    scrollToBottom();
}

// --------------------------------------------------
// AI Message (Markdown -> HTML + code copy)
// --------------------------------------------------
function addAIMessage(text) {
    const div = document.createElement("div");
    div.className = "msg msg-ai";

    let html = marked.parse(text);

    // Wrap code blocks and add copy button
    html = html.replace(
        /<pre><code(?: class="language-(.*?)")?>([\s\S]*?)<\/code><\/pre>/g,
        (_, __, code) => {
            // unescape html entities already produced by marked (keep code as-is)
            return `
                <div class="code-wrapper">
                    <button class="copy-btn">copy</button>
                    <pre><code>${code}</code></pre>
                </div>
            `;
        }
    );

    div.innerHTML = html;
    chatContainer.appendChild(div);

    activateCopyButtons();
    scrollToBottom();
}

// --------------------------------------------------
// Typing Bubble (blinking robot + dots)
//   -> robot has .robot-blink class (blinks)
// --------------------------------------------------
function addTypingBubble() {
    const bubble = document.createElement("div");
    bubble.className = "msg msg-ai";

    bubble.innerHTML = `
        <div class="typing">
            <span class="robot-blink">🤖</span>
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>
    `;

    chatContainer.appendChild(bubble);
    scrollToBottom();
    return bubble;
}

// --------------------------------------------------
// Copy Buttons
// --------------------------------------------------
function activateCopyButtons() {
    document.querySelectorAll(".copy-btn").forEach(btn => {
        // Avoid re-binding handlers multiple times
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";

        btn.onclick = () => {
            const codeEl = btn.parentElement.querySelector("code");
            if (!codeEl) return;
            const code = codeEl.innerText;
            navigator.clipboard.writeText(code).then(() => {
                btn.innerText = "copied!";
                setTimeout(() => btn.innerText = "copy", 1000);
            }).catch(() => {
                btn.innerText = "failed";
                setTimeout(() => btn.innerText = "copy", 1200);
            });
        };
    });
}

// --------------------------------------------------
// Sound Effect (tiny Base64 click)
 // --------------------------------------------------
function playClick() {
    try {
        const audio = new Audio(
            "data:audio/wav;base64,UklGRrQAAABXQVZFZm10IBAAAAABAAEAIlYAACJWAAABAAgAZGF0YcQAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAf39/fwAAAP///wD///8A////AP///wD///8A////AP///wD+/v4A/v7+AP7+/gD+/v4A/v7+AP7+/gD+/v4A/v7+AP7+/gD9/f0A/f39AP39/QD9/f0A/f39AP39/QD9/f0A/f39AP39/QD8/PwA/Pz8APz8/AD8/PwA/Pz8APz8/AD8/PwA+/v7APv7+wD7+/sA+/v7APv7+wD7+/sA+/v7APr6+gD6+voA+vr6APr6+gD6+voA+vr6APr6+gD5+fkA+fn5APn5+QD5+fkA+fn5APn5+QD5+fkA+Pf3APj39wD49/cA+Pf3APj39wD49/cA+Pf3APf39wD39/cA9/f3APf39wD39/cA9/f3APf39wD39/cA9vb2APb29gD29vYA9vb2APb29gD29vYA9vb2APX19QD19fUA9fX1APX19QD19fUA9fX1APX19QDw8PA="
        );
        audio.volume = 0.9;
        audio.play().catch(() => {});
    } catch (e) {}
}

// --------------------------------------------------
// Send Message
// --------------------------------------------------
async function sendMessage() {
    const text = inputBox.value.trim();
    if (!text) return;

    addUserMessage(text);
    inputBox.value = "";

    const typingBubble = addTypingBubble();
    const model = modelSelect.value;

    try {
        const response = await fetch("http://127.0.0.1:8000/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                model,
                prev_model: lastModelUsed
            })
        });

        // If server returns non-JSON / error, this will throw
        const data = await response.json();
        typingBubble.remove();

        // If server requested a system note (model switch), show it (no blinking robot)
        if (data.system_note) {
            // play sound & show loader animation
            playClick();
            addSystemNote(data.system_note, true);
        }

        lastModelUsed = model;
        addAIMessage(data.reply);

    } catch (error) {
        // remove typing indicator and show error
        typingBubble.remove();
        addAIMessage("❌ Could not connect to backend.");
        console.error("sendMessage error:", error);
    }
}

// --------------------------------------------------
// Button & Enter bindings
// --------------------------------------------------
sendBtn.onclick = sendMessage;
inputBox.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// --------------------------------------------------
// On Model Change -> show system note
// --------------------------------------------------
modelSelect.addEventListener("change", () => {
    const selected = modelSelect.value;

    playClick();  // clearly audible

    addSystemNote(`Switching to <b>${selected}</b> 🤖`, true);
});


// --------------------------------------------------
// Opening Welcome
// --------------------------------------------------
addAIMessage(
    "Welcome! 😊 How can I help you today?<br>" +
    "Paste your prompt, logs, or error code — I’ll guide you step-by-step in fixing your issues.🔧"
);
