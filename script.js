const apiKey = CONFIG.API_KEY; 
const consoleText = document.getElementById('consoleText');
const imageSlot = document.getElementById('imageSlot');
const imgLoader = document.getElementById('imgLoader');
const emptyMsg = document.getElementById('emptyMsg');
const actionBar = document.getElementById('actionBar');
const saveBtn = document.getElementById('saveBtn');
const visualOneBtn = document.getElementById('visualOneBtn');
const visualFourBtn = document.getElementById('visualFourBtn');
let currentResponseText = "";
let generationCount = 0;

consoleText.addEventListener('input', () => {
	const text = consoleText.innerText.trim();
	if (text.length > 5 && text !== "System ready. Type your prompt below or select a core to begin ✨") {
		currentResponseText = text;
		actionBar.style.display = 'flex';
	} else if (!text.length) {
		actionBar.style.display = 'none';
	}
});

	
consoleText.addEventListener('focus', () => {
	if (consoleText.innerText.includes("System ready.")) {
		consoleText.innerText = "";
	}
});
	
async function fetchWithRetry(url, options, retries = 5, backoff = 1000) {
	try {
		const response = await fetch(url, options);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.json();
	} catch (err) {
		if (retries > 0) {
			await new Promise(r => setTimeout(r, backoff));
			return fetchWithRetry(url, options, retries - 1, backoff * 2);
		}
		throw err;
	}
}
	
async function callText(prompt, history = []) {
	const contents = history.length ? history : [{ parts: [{ text: prompt }] }];
	const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
	const body = {
		contents,
		systemInstruction: {
			parts: [{
				text: "You are a professional Creative Director specializing in Liquid-Glass glossy web designs. Provide highly detailed, vivid, and technical descriptions of concepts, focusing on textures, lighting, materiality, and user interaction. Keep responses focused and technical."
			}]
		}
	};
	const data = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
	const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!text) throw new Error("Empty text response");
	return text;
}

async function callImage(prompt, count = 1) {
	generationCount++;
	const safeCount = Math.max(1, Math.min(4, count));
	const uniquePrompt = `${(prompt || "").substring(0, 300)}. Iteration ${generationCount}.`;
	const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
	
	const body = {
		instances: [{ prompt: `Cinematic professional web design mockup, high-end metallic UI, ${uniquePrompt}, 8k resolution, elegant lighting, studio shot` }],
		parameters: { sampleCount: safeCount }
	};
	
	const data = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
	const preds = data?.predictions;
	
	if (!Array.isArray(preds) || preds.length === 0) throw new Error("No images returned");
	
	return preds
	.filter(p => p?.bytesBase64Encoded) 
	.map(p => `data:image/png;base64,${p.bytesBase64Encoded}`);
}

async function callTTS(text) {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
	const body = {
		contents: [{ parts: [{ text: `Say smoothly and professionally: ${text}` }] }],
		generationConfig: {
			responseModalities: ["AUDIO"],
			speechConfig: {
				voiceConfig: {
					prebuiltVoiceConfig: { voiceName: "Zephyr" } 
				} 
			} 
		}
	};
	const data = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
	const audioData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
	if (audioData) playPCM16(audioData, 24000);
}

function playPCM16(base64Data, sampleRate) {
	const binaryString = atob(base64Data);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
	const wavHeader = new ArrayBuffer(44);
	const view = new DataView(wavHeader);
	const writeString = (offset, string) => { for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i)); };
		writeString(0, 'RIFF'); view.setUint32(4, 36 + bytes.length, true);
		writeString(8, 'WAVE'); writeString(12, 'fmt '); view.setUint32(16, 16, true);
		view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
		writeString(36, 'data'); view.setUint32(40, bytes.length, true);
		const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
		new Audio(URL.createObjectURL(blob)).play();
}
	
function clearGallery() {
	const containers = imageSlot.querySelectorAll('.manifest-image-container');
	containers.forEach(el => el.remove());
	emptyMsg.style.display = 'block';
	generationCount = 0;
	saveBtn.style.display = 'none';
}

async function runAction(btn, prompt) {
	currentResponseText = "";
	consoleText.innerHTML = "✨ Processing logic flow...";
	actionBar.style.display = 'none';
	clearGallery();
	imgLoader.style.display = 'none';
	if(btn) btn.classList.add('loading');
	try {
		const text = await callText(prompt);
		currentResponseText = text;
		consoleText.innerText = text;
		actionBar.style.display = 'flex';
	} catch (e) {
		consoleText.innerText = "Error in neural link. Try again.";
	} finally {
		if(btn) btn.classList.remove('loading');
	}
}

async function manifestImages(count) {
	visualOneBtn.disabled = true;
	visualFourBtn.disabled = true;
	imgLoader.style.display = 'block';
	emptyMsg.style.display = 'none';
	
	const prompt = consoleText.innerText.trim();	
	try {
		const imgList = await callImage(prompt, count);
		let firstNewContainer = null;
		imgList.forEach((imgData) => {
			const container = document.createElement('div');
			container.className = 'manifest-image-container';
			
			// Create Remove Button
			const removeBtn = document.createElement('div');
			removeBtn.className = 'remove-img-btn';
			removeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
			removeBtn.onclick = (e) => {
				e.stopPropagation();
				container.remove();
				
				// Check if gallery is empty after removal
				
				if (imageSlot.querySelectorAll('.manifest-image-container').length === 0) {
					saveBtn.style.display = 'none';
					emptyMsg.style.display = 'block';
				}
			};
			
			const img = document.createElement('img');
			img.src = imgData;
			container.appendChild(removeBtn);
			container.appendChild(img);
			imageSlot.appendChild(container);
			if (!firstNewContainer) firstNewContainer = container;
		});
		
		firstNewContainer?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
		saveBtn.style.display = 'flex';
	} catch (e) {
		emptyMsg.innerText = "Manifestation error. Try again.";
		emptyMsg.style.display = 'block';
	} finally {
		visualOneBtn.disabled = false;
		visualFourBtn.disabled = false;
		imgLoader.style.display = 'none';
	}
}

document.getElementById('magicBtn').onclick = () => runAction(magicBtn, "Provide a comprehensive and detailed description for a futuristic web design concept that utilizes liquid metal and deep gloss shadows.");
document.getElementById('stormBtn').onclick = () => runAction(stormBtn, "Explain in-depth the core technical and aesthetic principles required for professional high-end gloss UI design.");
document.getElementById('trendBtn').onclick = () => runAction(trendBtn, "Provide an extensive and detailed forecast for the most influential digital design trend emerging in late 2026.");

visualOneBtn.onclick = () => manifestImages(1);
visualFourBtn.onclick = () => manifestImages(4);

document.getElementById('voiceBtn').onclick = async function() {
	this.disabled = true;
	try { await callTTS(consoleText.innerText); } finally { this.disabled = false; }
};

saveBtn.onclick = async function() {
	const originalContent = this.innerHTML;
	this.innerHTML = "✨ Preparing PDF...";
	this.disabled = true;
	
	try {
		const { jsPDF } = window.jspdf;
		const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
		const margin = 20;
		const pageWidth = doc.internal.pageSize.getWidth();
		const contentWidth = pageWidth - (margin * 2);
		
		doc.setFillColor(5, 5, 5);
		doc.rect(0, 0, 210, 297, 'F');
		doc.setTextColor(204, 204, 204);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(24);
		doc.text("GEMINI DESIGN LAB", margin, 30);
		doc.setFontSize(10);
		doc.setTextColor(100, 100, 100);
		doc.text(`PROJECT EXPORT • ${new Date().toLocaleDateString()}`, margin, 38);
		doc.setDrawColor(204, 204, 204, 0.2);
		doc.line(margin, 45, pageWidth - margin, 45);
		doc.setTextColor(230, 230, 230);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(11);
		
		const splitDescription = doc.splitTextToSize(consoleText.innerText, contentWidth);
		doc.text(splitDescription, margin, 60);
		
		const containers = imageSlot.querySelectorAll('.manifest-image-container');
		containers.forEach((container, i) => {
			const img = container.querySelector('img');
			if (!img) return;
			doc.addPage();
			doc.setFillColor(5, 5, 5);
			doc.rect(0, 0, 210, 297, 'F');
			doc.setTextColor(204, 204, 204);
			doc.setFontSize(14);
			doc.text(`Visual Manifest Variation ${i + 1}`, margin, 25);
			doc.setDrawColor(204, 204, 204, 0.1);
			doc.line(margin, 30, pageWidth - margin, 30);
			try {
				const imgW = contentWidth;
				const imgH = (imgW * 9) / 16; 
				doc.addImage(img.src, 'PNG', margin, 40, imgW, imgH);
			} catch (err) { console.error("Image error", err); }
		});
		doc.save(`Gemini-Design-Project-${Date.now()}.pdf`);
		this.innerHTML = "✨ Export Success";
		setTimeout(() => { this.innerHTML = originalContent; this.disabled = false; }, 2000);
	} catch (err) {
		this.innerHTML = "✨ Export Error";
		this.disabled = false;
	}
};

document.getElementById('sendChat').onclick = async function() {
	const input = document.getElementById('chatInput');
	if (!input.value) return;
	const prompt = input.value;
	input.value = "";
	consoleText.innerHTML = "✨ Refining core logic...";
	actionBar.style.display = 'none';
	try {
		const text = await callText(`History: "${consoleText.innerText}". User Refinement Request: ${prompt}. Provide an updated design description.`);
		consoleText.innerText = text;
		actionBar.style.display = 'flex';
	} catch (e) {
		consoleText.innerText = "Error refining. Check connectivity.";
	}
};

const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
function initBG() {
	canvas.width = window.innerWidth; canvas.height = window.innerHeight;
	particles = Array.from({ length: 80 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, s: Math.random() * 1.5, v: Math.random() * 0.2 + 0.1 }));
}
function drawBG() {
	ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "rgba(255,255,255,0.4)";
	particles.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); p.y -= p.v; if (p.y < 0) p.y = canvas.height; });
		requestAnimationFrame(drawBG);
	}
		window.onresize = initBG; initBG(); drawBG();
		
		document.querySelectorAll('.glass-circle').forEach(btn => {
			btn.onmousemove = (e) => {
				const r = btn.getBoundingClientRect();
				const x = e.clientX - r.left - r.width / 2;
				const y = e.clientY - r.top - r.height / 2;
				btn.style.setProperty('--rim-rotation', `${Math.atan2(y, x) * (180 / Math.PI)}deg`);
			};
		});
		
		
// --- Simplified Listen Feature ---
const floatBtn = document.getElementById('floatingListenBtn');

document.addEventListener('selectionchange', () => {
	const selection = window.getSelection();
	const text = selection.toString().trim();
	
	// 1. Check if text exists and meets the word count (reduced to 15 for easier testing)
	if (text.length > 0) {
		const words = text.split(/\s+/).filter(w => w.length > 0);
		
		if (words.length > 15) {
			const range = selection.getRangeAt(0);
			const rect = range.getBoundingClientRect();
			
			// 2. Position the button relative to the current selection
			floatBtn.style.display = 'flex';
			floatBtn.style.top = `${rect.top - 50}px`; 
			floatBtn.style.left = `${rect.left + (rect.width / 2) - 45}px`;
			
			// 3. Click handler to trigger your existing callTTS function
			floatBtn.onclick = async (e) => {
				e.preventDefault();
				e.stopPropagation();
				
				const originalHTML = floatBtn.innerHTML;
				floatBtn.innerHTML = "✨ Processing...";
				
				await callTTS(text);
				
				// Reset state
				floatBtn.innerHTML = originalHTML;
				floatBtn.style.display = 'none';
				selection.removeAllRanges();
			};
			return;
		}
	}
	floatBtn.style.display = 'none';
});

// Hide if the user clicks anywhere else on the interface
document.addEventListener('mousedown', (e) => {
	if (!e.target.closest('#floatingListenBtn')) {
		floatBtn.style.display = 'none';
	}
});