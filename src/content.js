let firefox = true;
if (typeof browser === "undefined") {
    browser = chrome
    firefox = false
}

function main() {
	console.log("Loading content script, everything is fine and dandy!");
    let p = document.querySelector("main > div > div > div > div")
    let c;
// loop through c to see if they are p elements or pre elements
    let page = []
    let first_time = true
    let id;
    document.body.appendChild(document.createElement(`div`)).setAttribute("id", "chat_history");
    let history_box = document.querySelector("#chat_history");

	//<polyline points="15 18 9 12 15 6">
	//<polyline points="9 18 15 12 9 6">
	/*
		The way that this new state works is by constantly updating and filling in the gaps.
		The length of an autosave should be short enough that in the time the user is flipping through the HTML, 
			they should traverse ALL of the possible nodes without us having to add listeners.
	 */
	let mirror_branch_state;
	mirror_branch_state = new TreeNode();

	/*
		mirror the state in a non-binary tree
		we use a class for convenience and namespace;
		to export to JSON, use the dedicated .toJSON() function 
	 */
	function TreeNode(data)
	{
		this.leaves = [];
		this.data = data;
		// instance 
		this.currentLeafIndex = -1;
	}

	TreeNode.prototype.getData = function()
	{
		return this.data;
	}

	TreeNode.prototype.getCurrentLeaf = function()
	{
		return this.leaves[this.currentLeafIndex];
	}

	TreeNode.prototype.getLeaves = function()
	{
		return this.leaves;
	}

	TreeNode.prototype.addLeaf = function(leaf)
	{
		this.leaves.push(leaf);
		this.currentLeafIndex++;
	}

	TreeNode.prototype.addLeafCurrentLeaf = function(leaf)
	{
		let currentLeaf = this.leaves[this.currentLeafIndex];
		if(currentLeaf)
		{
			currentLeaf.addLeaf(leaf);
		}
	}

	TreeNode.prototype.addLeafByData = function(data)
	{
		let leaf = new TreeNode(data);
		this.addLeaf(leaf);
	}

	TreeNode.prototype.setData = function(data)
	{
		this.data = data;
	}

	TreeNode.prototype.setCurrentLeafIndex = function(index)
	{
		this.currentLeafIndex = index;
	}

	// traverses the tree according to the current leaf indices
	// returns the data in an array, much like the old .convo field
	TreeNode.prototype.getCurrentData = function()
	{
		let data = [this.data];
		let currentLeaf = this.leaves[this.currentLeafIndex];
		let leafData = [];
		if(currentLeaf)
		{
			leafData = currentLeaf.getCurrentData();
		}
		return data.concat(leafData);
	}

	// return a primitive data version for storage
	TreeNode.prototype.toJSON = function()
	{
		let JSONObject = {data:this.data, leaves:[]};
		for(let index = 0, length = this.leaves.length; index < length; index++)
		{
			if(this.leaves[index])
			{
				JSONObject.leaves[index] = this.leaves[index].toJSON();
			}
			else 
			{
				console.warn(`TreeNode.toJSON: Empty object at index ${index}.`);
			}
		}
		return JSONObject;
	}
	
	function encode_string_as_blob(string)
	{
		let bytes = new TextEncoder().encode(string);
		let blob = new Blob([bytes], {
			type: "application/json;charset=utf-8"
		});
		return blob;
	}
	/* conversion functions for export and download */
	function convert_thread_to_JSON_file(thread)
	{
		let data = thread;
		let string = JSON.stringify(data);
		let blob = encode_string_as_blob(string);
		return blob;
	}

	function convert_thread_to_text_file(thread)
	{
		let string = "Date:" + thread.date + " " + thread.time + "\n";
		let convo = thread.convo;
		for(let i = 0; i < convo.length; i++)
		{
			let speaker = i % 2 === 0 ? "Human" : "Assistant";
			string += speaker + ": " + convo[i] + "\n";
		}
		let blob = encode_string_as_blob(string);
		return blob;
	}

	function convert_chat_to_markdown(chat, title)
	{
		let string = "";
		if(title)
		{
			string += "# " + title + "\n";
		}
		else 
		{
			string += "# " + "ChatGPT Conversation" + "\n";
		}
		string += "\n"; // two newlines because MD is like that
		let convo = chat;
		for(let i = 0; i < convo.length; i++)
		{
			let speaker = i % 2 === 0 ? "Human" : "Assistant";
			string += "**" + speaker + ":**\n";
			string += convo[i] + "\n";
			string += "\n";
			string += "***\n";
			string += "\n";
		}
		
		// timestamp
		let date = getDate();
		let time = getTime();
		
		string += "Exported on " + date + " " + time + ".";
		
		let blob = encode_string_as_blob(string);
		return blob;
	}

    function saveChildInnerHTML(parent, clone = true) { // generated by ChatGPT
        // Get the child elements of the parent
        let p1;
        if (clone) {
            p1 = parent.cloneNode(true)
            p1.setAttribute("style", "display: none;");
            history_box.innerHTML = "";
            history_box.appendChild(p1);
        } else {
            p1 = parent
        }
        var children = p1.children;

        // Create a string to store the innerHTML of each child
        var childInnerHTML = '';

        // Loop through each child element
        for (var i = 0; i < children.length; i++) {
            // Clone the child element
            var child = children[i];
            if (child.tagName == "PRE") {
                let div = child.firstChild.children[1]
                div.firstChild.classList.add('p-4')
                let text = div.innerHTML
                let clipboard = `<i class="fa-regular clipboard fa-clipboard"></i>`
                let copy_bar = `<div class="p-2 copy float-right">${clipboard} &nbsp; Copy code</div>`
                let template = `<pre>${copy_bar}<div>${text}</div></pre><br>`
                childInnerHTML += template;
            } else {
                // Remove the child's class attribute
                child.removeAttribute("class");

                // Recursively call the function on the child's children
                saveChildInnerHTML(child, false);

                // Add the child's innerHTML to the string
                childInnerHTML += child.outerHTML;
            }
        }

        return childInnerHTML;
    }
	
	function elementChildHasClass(element, className)
	{
		if(!element)
		{
			console.warn(`undefined element passed, returning undefined and doing nothing.`);
			return;
		}
		if(element.classList.contains(className)) return true;
		
		let children = element.children; 
		for(let index = 0; index < children.length; index++)
		{
			if(elementChildHasClass(children[index], className)) return true;
		}
		return false;
	}
	
    function save_thread(human, h) {
        let text;
        if (human) {
            text = h.innerText // saves as plain text
			if(text.includes("Save & Submit\nCancel"))
			{
				// query the textarea instead 
				text = h.querySelector("textarea")?.value;
			}
            text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        if (!human) {
            text = saveChildInnerHTML(h.firstChild.children[1].firstChild.firstChild.firstChild) // saves as html
            if (elementChildHasClass(h, 'text-red-500')){
                text = "ERROR"
            }
        }
        return text
    }

    function getDate() { // generated by ChatGPT
        var date = new Date();
        var options = {year: 'numeric', month: 'long', day: 'numeric'};
        return date.toLocaleString('default', options);
    }

    function getTime() { // generated by ChatGPT
        var currentDate = new Date();
        var options = {
            hour12: true,
            hour: "numeric",
            minute: "numeric"
        };
        var timeString = currentDate.toLocaleTimeString("default", options);
        return timeString
    }

    function generateUUID() {
        // create an array of possible characters for the UUID
        var possibleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        // create an empty string that will be used to generate the UUID
        var uuid = "";

        // loop over the possible characters and append a random character to the UUID string
        for (var i = 0; i < 36; i++) {
            uuid += possibleChars.charAt(Math.floor(Math.random() * possibleChars.length));
        }

        // return the generated UUID
        return uuid;
    }
	
	/**
		Returns the data of the current chat text. Only saves one branch.
		This is intended for exports and or screenshots.
		Querys main again so it works with the new text.
	 */
	function get_current_chat_text()
	{
		let mainElement = document.querySelector("main");
		// should be more robust, can't see how they would change the flex col anytime soon
		let chatContainer = mainElement.querySelector(".flex-col"); 
		// what is one part of a conversation called again? let's just call it a chat bubble
		let chatBubbleElements = chatContainer.children;;
		let chat = [];
		
		// remember to disregard the last element, which is always a filler element
		for(let i = 0; i < chatBubbleElements.length-1; i++)
		{
			let isHuman = (i % 2) === 0;
			let chatBubble = chatBubbleElements[i];
			let text = get_chat_bubble_text(chatBubble, isHuman);
			chat.push(text);
		}
		
		return chat;
	}
	
	// gets chat with errors, for current export.
	function get_chat_bubble_text(chatBubble, isHuman)
	{
		let text;
		if(isHuman)
		{
			text = chatBubble.innerText;
			if(text.includes("Save & Submit\nCancel"))
			{
				// query the textarea instead 
				text = chatBubble.querySelector("textarea")?.value;
			}
			// for code
			text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
		}
		else 
		{
			text = saveChildInnerHTML(chatBubble.firstChild.children[1].firstChild.firstChild.firstChild) // saves as html
		}
        return text;
	}

    function save_page() {
        c = p.children
        if (c.length > 2) {
            let t;
            browser.storage.local.get({threads: null}).then((result) => {
                t = result.threads
                page = [];
				let current_leaf = mirror_branch_state;
                for (let i = 0; i < c.length - 1; i++) {
                    let human = i % 2 === 0;
					let child = c[i];
                    let text = save_thread(human, child)
                    if (text === "ERROR" || text.includes(`<p>network error</p>`) || text.includes(`<p>Load failed</p>`) || text.includes(`<p>Error in body stream/p>`)) {
                        text = t[t.length - 1].convo[i]
                        if (!text.endsWith(`(error)`)) {
                            text = `${text}<br> (error)`
                        }
                    }
                    page.push(text);

                    // mirror state;

                    let elements = child.querySelectorAll("span");
                    // get last element
                    let spanText = elements[elements.length - 1]?.innerHTML; // html instead of text because it sometimes hides
                    if (human) {
                        // because there are now two spans being used for other stuff, but only for humans
                        if (elements.length < 3) spanText = undefined;
                    }

                    let leafIndex = 0;
                    if (spanText) {
                        let spanNumber = Number(spanText.split("/")[0]);
                        // sometimes spanText trawls up "!" that comes from content warning policy; just ignore that.
                        if (!isNaN(spanNumber)) {
                            // remember array indices start at 0
                            leafIndex = spanNumber - 1;
                            console.log(leafIndex);
                        }
                    }
                    current_leaf.setCurrentLeafIndex(leafIndex);
                    if (leafIndex > -1) {
                        let new_current_leaf = current_leaf.getCurrentLeaf();
                        if (!new_current_leaf) {
                            new_current_leaf = new TreeNode();
                            // array.set in case we don't start at the beginning.
                            // yes, that is a thing that happens
                            current_leaf.getLeaves()[leafIndex] = new_current_leaf;
                        }
                        new_current_leaf.setData(text);
                        current_leaf = new_current_leaf;
                    }
                }
                console.log(mirror_branch_state.toJSON());
                if (mirror_branch_state !== null) {
                    if (t !== null) {
                        if (first_time) {
                            id = generateUUID();
                            let thread = {
                                date: getDate(),
                                time: getTime(),
                                convo: page,
                                favorite: false,
                                id: id,
                                branch_state: mirror_branch_state.toJSON()
                            }
                            t.push(thread)
                            first_time = false
                        } else {
                            let thread = {
                                date: getDate(),
                                time: getTime(),
                                convo: page,
                                favorite: false,
                                id: id,
                                branch_state: mirror_branch_state.toJSON()
                            }
                            t[t.length - 1] = thread
                        }
                        browser.storage.local.set({threads: t})
                    } else {
                        id = generateUUID()
                        let thread = {
                            date: getDate(),
                            time: getTime(),
                            convo: page,
                            favorite: false,
                            id: id,
                            branch_state: mirror_branch_state.toJSON()
                        }
                        let t = [thread]
                        first_time = false
                        browser.storage.local.set({threads: t})
                    }
                }
            });
        }
    }

    document.addEventListener('keydown', function (event) { // generated by ChatGPT
        // Check if the pressed key was the Enter key
        if (event.key === 'Enter') {
            setTimeout(save_page, 500)
        }
    });
	
	// add prompts before mutation observer fires
	browser.storage.local.get({prompts: null}).then((result) => {
		let parent = document.querySelector("main > div > div > div > div > div");
		
		let prompts = result.prompts;
		
		// check URL too and don't trigger when user is browsing history
		let url_string = document.location.href;
		url_string = url_string.split("/");
		if(url_string[url_string.length - 1] === "chat")
		{
		
			if(prompts)
			{
				let title = document.createElement("h2");
				title.innerHTML = "Your Prompts";
				title.classList.add("text-center");
				parent.appendChild(title);
				
				let promptsContainer = document.createElement("ul");
				promptsContainer.setAttribute("class", "flex flex-col gap-3.5 w-full sm:max-w-md m-auto");
				parent.appendChild(promptsContainer);
				
				let count = 0; // only load a limited number of the most recent prompts
				for(let i = prompts.length - 1; i > -1 && count < 3; i--)
				{
					// set parent height to fix scroll issues 
					parent.style.height = "auto";
					
					let prompt = prompts[i];
					let element = document.createElement("button");
					element.setAttribute("class", "w-full bg-gray-50 dark:bg-white/5 p-3 rounded-md hover:bg-gray-200 dark:hover:bg-gray-900");
					element.innerHTML = `"${prompt.text}"`;
					element.onclick = () => {
						// this disappears once you select first prompt, so it doesn't matter other textareas exist. We do this dynamically because otherwise refreshing will break it.
						let input = document.querySelector("textarea");
						input.value = `${prompt.text}`;
						input.innerHTML = `${prompt.text}`; 
						input.style.maxHeight = "200px"; // somehow this is needed, used from default.
						input.style.height = "200px"; // somehow this is needed, used from default.
						input.style.overflowY = "auto"; // somehow this is needed, used from default.
						
						// crazy workarounds to stop the initial text from being overwritten for some reason.
						// we use keydown instead because we WANT this thing to be overwritten.
						input.onkeydown = () => 
							{
								input.value = `${prompt.text}`;
								input.onkeydown = null; // then delete yourself once the weird initial block has been handled
							};
					}; 
					promptsContainer.appendChild(element);
					count++;
				}
			}
		
		}
	});

    let main = p

    //let stop_saving;
    let interval;
    const observer = new MutationObserver(function () { // created by chatGPT
        if (!timer_started) {
            interval = setInterval(save_page, 2000);
        }
        timer_started = true;
    });
    observer.observe(main, { // created by ChatGPT
        subtree: true,
        childList: true,
    });

    let reset = document.querySelector("nav").firstChild
    reset.addEventListener('click', function () {
        first_time = true;
		mirror_branch_state = new TreeNode();
    })
    let timer_started = false


    // BEGIN PDF/PNG/HTML DOWNLOAD BUTTONS
    function add_buttons(){ // generated by ChatGPT
        var nav = document.querySelector("nav");
        let button_class = 'flex py-3 px-3 items-center gap-3 rounded-md hover:bg-gray-500/10 transition-colors duration-200 text-white cursor-pointer text-sm'

        let pdf_svg = `<svg viewBox="0 0 24 24" width="18" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-file-text"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
		if(!firefox)
		{
			var pdf = document.createElement("a");
			pdf.id = 'download-pdf-button'
			pdf.onclick = () => {
				downloadThread({ as: Format.PDF });
			};
			pdf.setAttribute("class", button_class);
			pdf.innerHTML = `${pdf_svg} Download PDF`;
			nav.insertBefore(pdf, nav.children[nav.children.length-4]);
		}
		
		if(!firefox)
        {
			let png = document.createElement("a");
			png.id = 'download-png-button'
			png.onclick = () => {
				downloadThread({ as: Format.PNG });
			}
            png.setAttribute("class", button_class);
			let png_svg = `<svg xmlns="http://www.w3.org/2000/svg" style="fill: white" stroke="currentColor" width="18" height="19" viewBox="0 0 512 512"><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M0 96C0 60.7 28.7 32 64 32H448c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96zM323.8 202.5c-4.5-6.6-11.9-10.5-19.8-10.5s-15.4 3.9-19.8 10.5l-87 127.6L170.7 297c-4.6-5.7-11.5-9-18.7-9s-14.2 3.3-18.7 9l-64 80c-5.8 7.2-6.9 17.1-2.9 25.4s12.4 13.6 21.6 13.6h96 32H424c8.9 0 17.1-4.9 21.2-12.8s3.6-17.4-1.4-24.7l-120-176zM112 192c26.5 0 48-21.5 48-48s-21.5-48-48-48s-48 21.5-48 48s21.5 48 48 48z"/></svg>`
			png.innerHTML = `${png_svg} Download PNG`;
			nav.insertBefore(png, nav.children[nav.children.length-4]);
		}
        let buttonExportToMarkdown = document.createElement("a");
        buttonExportToMarkdown.id = 'download-markdown-button';
        buttonExportToMarkdown.onclick = () => {
            let fileName = `${document.title}.md`;
            let data = get_current_chat_text();
            let blob = convert_chat_to_markdown(data, document.title);
            download_blob_as_file(blob, fileName);
        }
        buttonExportToMarkdown.setAttribute("class", button_class)
        let markdown_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" style="fill: white" viewBox="0 0 640 512"><path d="M593.8 59.1H46.2C20.7 59.1 0 79.8 0 105.2v301.5c0 25.5 20.7 46.2 46.2 46.2h547.7c25.5 0 46.2-20.7 46.1-46.1V105.2c0-25.4-20.7-46.1-46.2-46.1zM338.5 360.6H277v-120l-61.5 76.9-61.5-76.9v120H92.3V151.4h61.5l61.5 76.9 61.5-76.9h61.5v209.2zm135.3 3.1L381.5 256H443V151.4h61.5V256H566z"/></svg>`
        buttonExportToMarkdown.innerHTML = `${markdown_svg} Export md`;
        nav.insertBefore(buttonExportToMarkdown, nav.children[nav.children.length-4]);

        if (!firefox) {
            let h = document.createElement("a");
            h.id = 'download-html-button'
            h.onclick = () => {
                sendRequest()
            }
            h.setAttribute("class", button_class);
            let h_svg = `<svg xmlns="http://www.w3.org/2000/svg" style="fill: white" stroke="currentColor" width="18" height="19" viewBox="0 0 448 512"><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M246.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 109.3V320c0 17.7 14.3 32 32 32s32-14.3 32-32V109.3l73.4 73.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-128-128zM64 352c0-17.7-14.3-32-32-32s-32 14.3-32 32v64c0 53 43 96 96 96H352c53 0 96-43 96-96V352c0-17.7-14.3-32-32-32s-32 14.3-32 32v64c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32V352z"/></svg>`
            h.innerHTML = `${h_svg} Share Page`;
            nav.insertBefore(h, nav.children[nav.children.length - 4]);
        }
    }
	
    if (buttons === true) {
        add_buttons()
    }

    const Format = {
        PNG: "png",
        PDF: "pdf",
    };

    function getData() {
        const globalCss = getCssFromSheet(
            document.querySelector("link[rel=stylesheet]").sheet
        );
        const localCss =
            getCssFromSheet(
                document.querySelector(`style[data-styled][data-styled-version]`).sheet
            ) || "body{}";
        const data = {
            main: document.querySelector("main").outerHTML,
            // css: `${globalCss} /* GLOBAL-LOCAL */ ${localCss}`,
            globalCss,
            localCss,
        };
        return data;
    }

    async function sendRequest() {
        function conversationData() {
            const threadContainer = document.querySelector(
                "#__next main div:nth-of-type(1) div:nth-of-type(1) div:nth-of-type(1) div:nth-of-type(1)"
            );

            var result = {
                avatarUrl: getAvatarImage(),
                items: [],
            };

            for (const node of threadContainer.children) {
                console.log(node)
                const markdownContent = node.querySelector(".markdown");

                // tailwind class indicates human or gpt
                if ([...node.classList].includes("dark:bg-gray-800")) {
                    result.items.push({
                        from: "human",
                        value: node.textContent,
                    });
                    // if it's a GPT response, it might contain code blocks
                } else if ([...node.classList].includes("bg-gray-50")) {
                    result.items.push({
                        from: "gpt",
                        value: markdownContent.outerHTML,
                    });
                }
            }

            return result;
        }

        function getAvatarImage() {
            // Create a canvas element
            const canvas = document.createElement("canvas");

            const image = document.querySelectorAll("img")[1];

            // Set the canvas size to 30x30 pixels
            canvas.width = 30;
            canvas.height = 30;

            // Draw the img onto the canvas
            canvas.getContext("2d").drawImage(image, 0, 0);

            // Convert the canvas to a base64 string as a JPEG image
            const base64 = canvas.toDataURL("image/jpeg");

            return base64;
        }
        let cd = conversationData();
        const res = await fetch("https://sharegpt.com/api/conversations", {
            body: JSON.stringify(cd),
            headers: {
                "Content-Type": "application/json",
            },
            method: "POST",
        });
        const {id} = await res.json();
        const url = `https://shareg.pt/${id}`; // short link to the ShareGPT post
        window.open(url, "_blank");
    }

    function handleImg(imgData) {
        const binaryData = atob(imgData.split("base64,")[1]);
        const data = [];
        for (let i = 0; i < binaryData.length; i++) {
            data.push(binaryData.charCodeAt(i));
        }
        const blob = new Blob([new Uint8Array(data)], { type: "image/png" });
        const url = URL.createObjectURL(blob);

        window.open(url, "_blank");

        //   const a = document.createElement("a");
        //   a.href = url;
        //   a.download = "chat-gpt-image.png";
        //   a.click();
    }
    function handlePdf(imgData, canvas, pixelRatio) {
        const { jsPDF } = window.jspdf;
        const orientation = canvas.width > canvas.height ? "l" : "p";
        var pdf = new jsPDF(orientation, "pt", [
            canvas.width / pixelRatio,
            canvas.height / pixelRatio,
        ]);
        var pdfWidth = pdf.internal.pageSize.getWidth();
        var pdfHeight = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        pdf.save("chat-gpt.pdf");
    }


    class Elements {
        constructor() {
            this.init();
        }
        init() {
            // this.threadWrapper = document.querySelector(".cdfdFe");
            this.spacer = document.querySelector(".w-full.h-48.flex-shrink-0");
            this.thread = document.querySelector(
                "[class*='react-scroll-to-bottom']>[class*='react-scroll-to-bottom']>div"
            );
            this.positionForm = document.querySelector("form").parentNode;
            // this.styledThread = document.querySelector("main");
            // this.threadContent = document.querySelector(".gAnhyd");
            this.scroller = Array.from(
                document.querySelectorAll('[class*="react-scroll-to"]')
            ).filter((el) => el.classList.contains("h-full"))[0];
            this.hiddens = Array.from(document.querySelectorAll(".overflow-hidden"));
            this.images = Array.from(document.querySelectorAll("img[srcset]"));
        }
        fixLocation() {
            this.hiddens.forEach((el) => {
                el.classList.remove("overflow-hidden");
            });
            this.spacer.style.display = "none";
            this.thread.style.maxWidth = "960px";
            this.thread.style.marginInline = "auto";
            this.positionForm.style.display = "none";
            this.scroller.classList.remove("h-full");
            this.scroller.style.minHeight = "100vh";
            this.images.forEach((img) => {
                const srcset = img.getAttribute("srcset");
                img.setAttribute("srcset_old", srcset);
                img.setAttribute("srcset", "");
            });
            //Fix to the text shifting down when generating the canvas
            document.body.style.lineHeight = "0.5";
        }
        restoreLocation() {
            this.hiddens.forEach((el) => {
                el.classList.add("overflow-hidden");
            });
            this.spacer.style.display = null;
            this.thread.style.maxWidth = null;
            this.thread.style.marginInline = null;
            this.positionForm.style.display = null;
            this.scroller.classList.add("h-full");
            this.scroller.style.minHeight = null;
            this.images.forEach((img) => {
                const srcset = img.getAttribute("srcset_old");
                img.setAttribute("srcset", srcset);
                img.setAttribute("srcset_old", "");
            });
            document.body.style.lineHeight = null;
        }
    }

    function downloadThread({ as = Format.PNG } = {}) {
        const elements = new Elements();
        elements.fixLocation();
        const pixelRatio = window.devicePixelRatio;
        const minRatio = as === Format.PDF ? 2 : 2.5;
        window.devicePixelRatio = Math.max(pixelRatio, minRatio);

        html2canvas(elements.thread, {
            letterRendering: true,
        }).then(async function (canvas) {
            elements.restoreLocation();
            window.devicePixelRatio = pixelRatio;
            const imgData = canvas.toDataURL("image/png");
            requestAnimationFrame(() => {
                if (as === Format.PDF) {
                    return handlePdf(imgData, canvas, pixelRatio);
                } else {
                    handleImg(imgData);
                }
            });
        });
    }
	
	// basially using the fileSaver.js, it's an IIFE to save on implementing the <a> singleton.
	const download_blob_as_file = (function()
	{
		let a = document.createElement("a");
		document.body.appendChild(a);
		a.style = "display: none";
		return function (blob, file_name)
		{
			let url = window.URL.createObjectURL(blob);
			a.href = url;
			a.download = file_name;
			a.click();
			window.URL.revokeObjectURL(url);
		}
	})();
		
    function getCssFromSheet(sheet) {
        return Array.from(sheet.cssRules)
            .map((rule) => rule.cssText)
            .join("");
    }
    function continue_convo(convo){
        const input = document.querySelector("textarea");
        input.style.height = "200px";
        const button = input.parentElement.querySelector("button");
        input.value = `${intro} ${convo}`;
        if (auto_send) {
            button.click();
        }
    }
	
	function use_prompt(prompt){
        const input = document.querySelector("textarea");
        input.style.height = "200px";
        const button = input.parentElement.querySelector("button");
        input.value = `${prompt}`;
        if (auto_send) {
            button.click();
        }
	}

    chrome.runtime.onMessage.addListener(
        function(request, sender, sendResponse) {
            console.log(request)
            if (request.type === "c_continue_convo") {
                console.log("message recieved!")
                continue_convo(JSON.stringify(request.convo))
            }
			else if(request.type === "c_use_prompt") {
				console.log("message recieved!");
				use_prompt(request.prompt);
			}
        }
    );
}

if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(main, 500);
}
else {
    document.addEventListener("DOMContentLoaded", main);
}

let buttons; let intro; let auto_send;
let defaults = {buttons: true, auto_send: false, auto_delete: false, message: "The following is a transcript of a conversation between me and ChatGPT. Use it for context in the rest of the conversation. Be ready to edit and build upon the responses previously given by ChatGPT. Respond \"ready!\" if you understand the context. Do not respond wit anything else. Conversation:\n"}
chrome.storage.local.get({settings: defaults}, function(result) {
    let settings = result.settings
    buttons = settings.buttons
    intro = settings.message
    auto_send = settings.auto_send
    console.log("buttons!" + buttons)
})