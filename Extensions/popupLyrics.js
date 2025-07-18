// NAME: Popup Lyrics
// AUTHOR: khanhas
//         Netease API parser and UI from https://github.com/mantou132/Spotify-Lyrics
// DESCRIPTION: Pop lyrics up

/// <reference path="../globals.d.ts" />

if (!navigator.serviceWorker) {
	// Worker code
	// When Spotify client is minimised, requestAnimationFrame does not call our tick function
	// setTimeout and setInterval are also throttled at 1 second.
	// Offload setInterval to a Worker to consistently call tick function.
	let num = null;
	// biome-ignore lint/suspicious/noGlobalAssign: <explanation>
	onmessage = (event) => {
		if (event.data === "popup-lyric-request-update") {
			console.warn("popup-lyric-request-update");
			num = setInterval(() => postMessage("popup-lyric-update-ui"), 16.66);
		} else if (event.data === "popup-lyric-stop-update") {
			clearInterval(num);
			postMessage("popup-lyric-update-ui");
			num = null;
		}
	};
} else {
	PopupLyrics();
}

let CACHE = {};

function PopupLyrics() {
	const { Player, CosmosAsync, LocalStorage, ContextMenu } = Spicetify;

	if (!CosmosAsync || !LocalStorage || !ContextMenu) {
		setTimeout(PopupLyrics, 500);
		return;
	}

	const worker = new Worker("./extensions/popupLyrics.js");
	worker.onmessage = (event) => {
		if (event.data === "popup-lyric-update-ui") {
			tick(userConfigs);
		}
	};

	let workerIsRunning = null;
	document.addEventListener("visibilitychange", (e) => {
		if (e.target.hidden) {
			if (!workerIsRunning) {
				worker.postMessage("popup-lyric-request-update");
				workerIsRunning = true;
			}
		} else {
			if (workerIsRunning) {
				worker.postMessage("popup-lyric-stop-update");
				workerIsRunning = false;
			}
		}
	});

	const LyricUtils = {
		normalize(s, emptySymbol = true) {
			const result = s
				.replace(/（/g, "(")
				.replace(/）/g, ")")
				.replace(/【/g, "[")
				.replace(/】/g, "]")
				.replace(/。/g, ". ")
				.replace(/；/g, "; ")
				.replace(/：/g, ": ")
				.replace(/？/g, "? ")
				.replace(/！/g, "! ")
				.replace(/、|，/g, ", ")
				.replace(/‘|’|′|＇/g, "'")
				.replace(/“|”/g, '"')
				.replace(/〜/g, "~")
				.replace(/·|・/g, "•");
			if (emptySymbol) {
				result.replace(/-/g, " ").replace(/\//g, " ");
			}
			return result.replace(/\s+/g, " ").trim();
		},

		removeExtraInfo(s) {
			return (
				s
					.replace(/-\s+(feat|with|prod).*/i, "")
					.replace(/(\(|\[)(feat|with|prod)\.?\s+.*(\)|\])$/i, "")
					.replace(/\s-\s.*/, "")
					.trim() || s
			);
		},

		capitalize(s) {
			return s.replace(/^(\w)/, ($1) => $1.toUpperCase());
		},
	};

	const LyricProviders = {
		async fetchSpotify(info) {
			const baseURL = "https://spclient.wg.spotify.com/color-lyrics/v2/track/";
			const id = info.uri.split(":")[2];
			const body = await CosmosAsync.get(`${baseURL + id}?format=json&vocalRemoval=false&market=from_token`);

			const lyricsData = body.lyrics;
			if (!lyricsData || lyricsData.syncType !== "LINE_SYNCED") {
				return { error: "가사없음" };
			}

			const lines = lyricsData.lines;
			const lyrics = lines.map((a) => ({
				startTime: a.startTimeMs / 1000,
				text: a.words,
			}));

			return { lyrics };
		},

		async fetchMusixmatch(info) {
			const baseURL =
				"https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&namespace=lyrics_synched&subtitle_format=mxm&app_id=web-desktop-app-v1.0&";

			const durr = info.duration / 1000;

			const params = {
				q_album: info.album,
				q_artist: info.artist,
				q_artists: info.artist,
				q_track: info.title,
				track_spotify_id: info.uri,
				q_duration: durr,
				f_subtitle_length: Math.floor(durr),
				usertoken: userConfigs.services.musixmatch.token,
			};

			const finalURL =
				baseURL +
				Object.keys(params)
					.map((key) => `${key}=${encodeURIComponent(params[key])}`)
					.join("&");

			try {
				let body = await CosmosAsync.get(finalURL, null, {
					authority: "apic-desktop.musixmatch.com",
					cookie: "x-mxm-token-guid=",
				});

				body = body.message.body.macro_calls;

				if (body["matcher.track.get"].message.header.status_code !== 200) {
					const head = body["matcher.track.get"].message.header;
					return {
						error: `요청오류: ${head.status_code}: ${head.hint} - ${head.mode}`,
					};
				}

				const meta = body["matcher.track.get"].message.body;
				const hasSynced = meta.track.has_subtitles;
				const isRestricted = body["track.lyrics.get"].message.header.status_code === 200 && body["track.lyrics.get"].message.body.lyrics.restricted;
				const isInstrumental = meta.track.instrumental;

				if (isRestricted) return { error: "이 가사를 표시할 권한이 없습니다." };
				if (isInstrumental) return { error: "♪ 전주곡 ♪" };
				if (hasSynced) {
					const subtitle = body["track.subtitles.get"].message.body.subtitle_list[0].subtitle;

					const lyrics = JSON.parse(subtitle.subtitle_body).map((line) => ({
						text: line.text || "♪",
						startTime: line.time.total,
					}));
					return { lyrics };
				}

				return { error: "가사없음" };
			} catch (err) {
				return { error: err.message };
			}
		},

		async fetchNetease(info) {
			const searchURL = "https://music.xianqiao.wang/neteaseapiv2/search?limit=10&type=1&keywords=";
			const lyricURL = "https://music.xianqiao.wang/neteaseapiv2/lyric?id=";
			const requestHeader = {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:93.0) Gecko/20100101 Firefox/93.0",
			};

			const cleanTitle = LyricUtils.removeExtraInfo(LyricUtils.normalize(info.title));
			const finalURL = searchURL + encodeURIComponent(`${cleanTitle} ${info.artist}`);

			const searchResults = await CosmosAsync.get(finalURL, null, requestHeader);
			const items = searchResults.result.songs;
			if (!items || !items.length) {
				return { error: "해당트랙을 찾을 수 없습니다." };
			}

			const album = LyricUtils.capitalize(info.album);
			const itemId = items.findIndex((val) => LyricUtils.capitalize(val.album.name) === album || Math.abs(info.duration - val.duration) < 1000);
			if (itemId === -1) return { error: "해당트랙을 찾을 수 없습니다." };

			const meta = await CosmosAsync.get(lyricURL + items[itemId].id, null, requestHeader);
			let lyricStr = meta.lrc;

			if (!lyricStr || !lyricStr.lyric) {
				return { error: "가사없음" };
			}
			lyricStr = lyricStr.lyric;

			const otherInfoKeys = [
				"\\s?作?\\s*词|\\s?作?\\s*曲|\\s?编\\s*曲?|\\s?监\\s*制?",
				".*编写|.*和音|.*和声|.*合声|.*提琴|.*录|.*工程|.*工作室|.*设计|.*剪辑|.*制作|.*发行|.*出品|.*后期|.*混音|.*缩混",
				"原唱|翻唱|题字|文案|海报|古筝|二胡|钢琴|吉他|贝斯|笛子|鼓|弦乐",
				"lrc|publish|vocal|guitar|program|produce|write|mix",
			];
			const otherInfoRegexp = new RegExp(`^(${otherInfoKeys.join("|")}).*(:|：)`, "i");

			const lines = lyricStr.split(/\r?\n/).map((line) => line.trim());
			let noLyrics = false;
			const lyrics = lines
				.flatMap((line) => {
					// ["[ar:Beyond]"]
					// ["[03:10]"]
					// ["[03:10]", "永远高唱我歌"]
					// ["永远高唱我歌"]
					// ["[03:10]", "[03:10]", "永远高唱我歌"]
					const matchResult = line.match(/(\[.*?\])|([^[\]]+)/g) || [line];
					if (!matchResult.length || matchResult.length === 1) {
						return;
					}
					const textIndex = matchResult.findIndex((slice) => !slice.endsWith("]"));
					let text = "";
					if (textIndex > -1) {
						text = matchResult.splice(textIndex, 1)[0];
						text = LyricUtils.capitalize(LyricUtils.normalize(text, false));
					}
					if (text === "纯音乐, 请欣赏") noLyrics = true;
					return matchResult.map((slice) => {
						const result = {};
						const matchResult = slice.match(/[^[\]]+/g);
						const [key, value] = matchResult[0].split(":") || [];
						const [min, sec] = [Number.parseFloat(key), Number.parseFloat(value)];
						if (!Number.isNaN(min) && !Number.isNaN(sec) && !otherInfoRegexp.test(text)) {
							result.startTime = min * 60 + sec;
							result.text = text || "♪";
							return result;
						}
						return;
					});
				})
				.sort((a, b) => {
					if (a.startTime === null) {
						return 0;
					}
					if (b.startTime === null) {
						return 1;
					}
					return a.startTime - b.startTime;
				})
				.filter(Boolean);

			if (noLyrics) {
				return { error: "가사없음" };
			}
			if (!lyrics.length) {
				return { error: "실시간가사 없음" };
			}

			return { lyrics };
		},

		async fetchLrclib(info) {
			const baseURL = "https://lrclib.net/api/get";
			const durr = info.duration / 1000;
			const params = {
				track_name: info.title,
				artist_name: info.artist,
				album_name: info.album,
				duration: durr,
			};

			const finalURL = `${baseURL}?${Object.keys(params)
				.map((key) => `${key}=${encodeURIComponent(params[key])}`)
				.join("&")}`;

			const body = await fetch(finalURL, {
				headers: {
					"x-user-agent": `spicetify v${Spicetify.Config.version} (https://github.com/spicetify/cli)`,
				},
			});

			if (body.status !== 200) {
				return { error: "요청오류: 트랙을 찾을 수 없습니다." };
			}

			const meta = await body.json();
			if (meta?.instrumental) {
				return { error: "♪ 전주곡 ♪" };
			}
			if (!meta?.syncedLyrics) {
				return { error: "실시간가사 없음" };
			}

			// Preprocess lyrics by removing [tags] and empty lines
			const lines = meta?.syncedLyrics
				.replaceAll(/\[[a-zA-Z]+:.+\]/g, "")
				.trim()
				.split("\n");

			const syncedTimestamp = /\[([0-9:.]+)\]/;
			const isSynced = lines[0].match(syncedTimestamp);

			const lyrics = lines.map((line) => {
				const time = line.match(syncedTimestamp)?.[1];
				const lyricContent = line.replace(syncedTimestamp, "").trim();
				const lyric = lyricContent.replaceAll(/<([0-9:.]+)>/g, "").trim();
				const [min, sec] = time.replace(/\[\]<>/, "").split(":");

				if (line.trim() !== "" && isSynced && time) {
					return { text: lyric || "♪", startTime: Number(min) * 60 + Number(sec) };
				}
				return;
			});

			return { lyrics };
		},
	};

	const userConfigs = {
		smooth: boolLocalStorage("popup-lyrics:smooth"),
		centerAlign: boolLocalStorage("popup-lyrics:center-align"),
		showCover: boolLocalStorage("popup-lyrics:show-cover"),
		fontSize: Number(LocalStorage.get("popup-lyrics:font-size")),
		blurSize: Number(LocalStorage.get("popup-lyrics:blur-size")),
		fontFamily: LocalStorage.get("popup-lyrics:font-family") || "spotify-circular",
		ratio: LocalStorage.get("popup-lyrics:ratio") || "11",
		delay: Number(LocalStorage.get("popup-lyrics:delay")),
		services: {
			netease: {
				on: boolLocalStorage("popup-lyrics:services:netease:on"),
				call: LyricProviders.fetchNetease,
				desc: "중국에서 운영하는 실시간 가사 서비스입니다. (정확도 떨어짐)",
			},
			musixmatch: {
				on: boolLocalStorage("popup-lyrics:services:musixmatch:on"),
				call: LyricProviders.fetchMusixmatch,
				desc: "Spotify와 완벽하게 호환이 됩니다. 가사를 원활하게 불러오지 못할 경우 <code>토큰 초기화</code> 버튼을 눌러주세요.",
				token: LocalStorage.get("popup-lyrics:services:musixmatch:token") || "2005218b74f939209bda92cb633c7380612e14cb7fe92dcd6a780f",
			},
			spotify: {
				on: boolLocalStorage("popup-lyrics:services:spotify:on"),
				call: LyricProviders.fetchSpotify,
				desc: "Spotify에서 공식으로 지원되는 가사입니다.",
			},
			lrclib: {
				on: boolLocalStorage("popup-lyrics:services:lrclib:on"),
				call: LyricProviders.fetchLrclib,
				desc: "LRCLIB는 오픈소스 가사 제공 서비스 입니다. 실시간 가사, 일반가사 모두 지원합니다.",
			},
		},
		servicesOrder: [],
	};

	userConfigs.fontSize = userConfigs.fontSize ? Number(userConfigs.fontSize) : 46;
	try {
		const rawServicesOrder = LocalStorage.get("popup-lyrics:services-order");
		userConfigs.servicesOrder = JSON.parse(rawServicesOrder);

		if (!Array.isArray(userConfigs.servicesOrder)) throw "";

		userConfigs.servicesOrder = userConfigs.servicesOrder.filter((s) => userConfigs.services[s]); // Remove obsoleted services

		const allServices = Object.keys(userConfigs.services);
		if (userConfigs.servicesOrder.length !== allServices.length) {
			for (const s of allServices) {
				if (!userConfigs.servicesOrder.includes(s)) {
					userConfigs.servicesOrder.push(s);
				}
			}
			LocalStorage.set("popup-lyrics:services-order", JSON.stringify(userConfigs.servicesOrder));
		}
	} catch {
		userConfigs.servicesOrder = Object.keys(userConfigs.services);
		LocalStorage.set("popup-lyrics:services-order", JSON.stringify(userConfigs.servicesOrder));
	}

	const lyricVideo = document.createElement("video");
	lyricVideo.muted = true;
	lyricVideo.width = 600;
	switch (userConfigs.ratio) {
		case "43":
			lyricVideo.height = Math.round((lyricVideo.width * 3) / 4);
			break;
		case "169":
			lyricVideo.height = Math.round((lyricVideo.width * 9) / 16);
			break;
		default:
			lyricVideo.height = lyricVideo.width;
			break;
	}

	let lyricVideoIsOpen = false;
	lyricVideo.onenterpictureinpicture = () => {
		lyricVideo.play();
		lyricVideoIsOpen = true;
		tick(userConfigs);
		updateTrack();
	};
	lyricVideo.onleavepictureinpicture = () => {
		lyricVideoIsOpen = false;
	};

	const lyricCanvas = document.createElement("canvas");
	lyricCanvas.width = lyricVideo.width;
	lyricCanvas.height = lyricVideo.height;

	const lyricCtx = lyricCanvas.getContext("2d");
	lyricVideo.srcObject = lyricCanvas.captureStream();
	lyricCtx.fillRect(0, 0, 1, 1);
	lyricVideo.play();

	const button = new Spicetify.Topbar.Button("Popup Lyrics", "lyrics", () => {
		if (!lyricVideoIsOpen) {
			lyricVideo.requestPictureInPicture();
		} else {
			document.exitPictureInPicture();
		}
	});
	button.element.oncontextmenu = openConfig;

	const coverCanvas = document.createElement("canvas");
	coverCanvas.width = lyricVideo.width;
	coverCanvas.height = lyricVideo.width;
	const coverCtx = coverCanvas.getContext("2d");

	const largeImage = new Image();
	largeImage.onload = () => {
		coverCtx.drawImage(largeImage, 0, 0, coverCtx.canvas.width, coverCtx.canvas.width);
	};
	userConfigs.backgroundImage = coverCanvas;

	let sharedData = {};

	Player.addEventListener("songchange", () => {
		updateTrack();
	});

	async function updateTrack(refresh = false) {
		if (!lyricVideoIsOpen) {
			return;
		}

		const meta = Player.data.item.metadata;

		if (!Spicetify.URI.isTrack(Player.data.item.uri) && !Spicetify.URI.isLocalTrack(Player.data.item.uri)) {
			return;
		}

		largeImage.src = meta.image_url;
		const info = {
			duration: Number(meta.duration),
			album: meta.album_title,
			artist: meta.artist_name,
			title: meta.title,
			uri: Player.data.item.uri,
		};

		if (CACHE?.[info.uri]?.lyrics?.length && !refresh) {
			sharedData = CACHE[info.uri];
		} else {
			for (const name of userConfigs.servicesOrder) {
				const service = userConfigs.services[name];
				if (!service.on) continue;
				sharedData = { lyrics: [] };

				try {
					const data = await service.call(info);
					sharedData = data;
					CACHE[info.uri] = sharedData;

					if (!sharedData.error) {
						return;
					}
				} catch (err) {
					sharedData = { error: "가사없음" };
				}
			}
		}
	}

	// simple word segmentation rules
	function getWords(str) {
		const result = [];
		const words = str.split(/(\p{sc=Han}|\p{sc=Katakana}|\p{sc=Hiragana}|\p{sc=Hang}|\p{gc=Punctuation})|\s+/gu);
		let tempWord = "";
		for (let word of words) {
			word ??= " ";
			if (word) {
				if (tempWord && /(“|')$/.test(tempWord) && word !== " ") {
					// End of line not allowed
					tempWord += word;
				} else if (/(,|\.|\?|:|;|'|，|。|？|：|；|”)/.test(word) && tempWord !== " ") {
					// Start of line not allowed
					tempWord += word;
				} else {
					if (tempWord) result.push(tempWord);
					tempWord = word;
				}
			}
		}
		if (tempWord) result.push(tempWord);
		return result;
	}

	function drawParagraph(ctx, str, options) {
		let actualWidth = 0;
		const maxWidth = ctx.canvas.width - options.left - options.right;
		const words = getWords(str);
		const lines = [];
		const measures = [];
		let tempLine = "";
		let textMeasures = ctx.measureText("");
		for (let i = 0; i < words.length; i++) {
			const word = words[i];
			const line = tempLine + word;
			const mea = ctx.measureText(line);
			const isSpace = /\s/.test(word);
			if (mea.width > maxWidth && tempLine && !isSpace) {
				actualWidth = Math.max(actualWidth, textMeasures.width);
				lines.push(tempLine);
				measures.push(textMeasures);
				tempLine = word;
			} else {
				tempLine = line;
				if (!isSpace) {
					textMeasures = mea;
				}
			}
		}
		if (tempLine !== "") {
			actualWidth = Math.max(actualWidth, textMeasures.width);
			lines.push(tempLine);
			measures.push(ctx.measureText(tempLine));
		}

		const ascent = measures.length ? measures[0].actualBoundingBoxAscent : 0;
		const body = measures.length ? options.lineHeight * (measures.length - 1) : 0;
		const descent = measures.length ? measures[measures.length - 1].actualBoundingBoxDescent : 0;
		const actualHeight = ascent + body + descent;

		let startX = 0;
		let startY = 0;
		let translateX = 0;
		let translateY = 0;
		if (options.hCenter) {
			startX = (ctx.canvas.width - actualWidth) / 2;
		} else {
			startX = options.left + translateX;
		}

		if (options.vCenter) {
			startY = (ctx.canvas.height - actualHeight) / 2 + ascent;
		} else if (options.top) {
			startY = options.top + ascent;
		} else if (options.bottom) {
			startY = options.bottom - descent - body;
		}

		if (typeof options.translateX === "function") {
			translateX = options.translateX(actualWidth);
		}
		if (typeof options.translateX === "number") {
			translateX = options.translateX;
		}
		if (typeof options.translateY === "function") {
			translateY = options.translateY(actualHeight);
		}
		if (typeof options.translateY === "number") {
			translateY = options.translateY;
		}
		if (!options.measure) {
			lines.forEach((str, index) => {
				const x = options.hCenter ? (ctx.canvas.width - measures[index].width) / 2 : startX;
				ctx.fillText(str, x, startY + index * options.lineHeight + translateY);
			});
		}
		return {
			width: actualWidth,
			height: actualHeight,
			left: startX + translateX,
			right: ctx.canvas.width - options.left - actualWidth + translateX,
			top: startY - ascent + translateY,
			bottom: startY + body + descent + translateY,
		};
	}

	function drawBackground(ctx, image) {
		if (userConfigs.showCover) {
			const { width, height } = ctx.canvas;
			ctx.imageSmoothingEnabled = false;
			ctx.save();
			const blurSize = Number(userConfigs.blurSize);
			ctx.filter = `blur(${blurSize}px)`;
			ctx.drawImage(image, -blurSize * 2, -blurSize * 2 - (width - height) / 2, width + 4 * blurSize, width + 4 * blurSize);
			ctx.restore();
			ctx.fillStyle = "#000000b0";
		} else {
			ctx.save();
			ctx.fillStyle = "#000000";
		}

		ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		ctx.restore();
	}

	function drawText(ctx, text, color = "white") {
		drawBackground(ctx, userConfigs.backgroundImage);
		const fontSize = userConfigs.fontSize;
		ctx.fillStyle = color;
		ctx.font = `bold ${fontSize}px ${userConfigs.fontFamily}, sans-serif`;
		drawParagraph(ctx, text, {
			vCenter: true,
			hCenter: true,
			left: 0,
			right: 0,
			lineHeight: fontSize,
		});
		ctx.restore();
	}

	let offscreenCanvas;
	let offscreenCtx;
	let gradient1;
	let gradient2;

	function initOffscreenCtx(ctx) {
		if (!offscreenCtx) {
			offscreenCanvas = document.createElement("canvas");
			offscreenCtx = offscreenCanvas.getContext("2d");
			gradient1 = offscreenCtx.createLinearGradient(0, 0, 0, ctx.canvas.height);
			gradient1.addColorStop(0.08, "transparent");
			gradient1.addColorStop(0.15, "white");
			gradient1.addColorStop(0.85, "white");
			gradient1.addColorStop(0.92, "transparent");
			gradient2 = offscreenCtx.createLinearGradient(0, 0, 0, ctx.canvas.height);
			gradient2.addColorStop(0.0, "white");
			gradient2.addColorStop(0.7, "white");
			gradient2.addColorStop(0.925, "transparent");
		}
		offscreenCtx.canvas.width = ctx.canvas.width;
		offscreenCtx.canvas.height = ctx.canvas.height;
		return {
			offscreenCtx,
			gradient1,
			gradient2,
		};
	}

	// Avoid drawing again when the same
	// Do not operate canvas again in other functions
	let renderState;

	function isEqualState(state1, state2) {
		if (!state1 || !state2) return false;
		return Object.keys(state1).reduce((p, c) => {
			return p && state1[c] === state2[c];
		}, true);
	}

	function renderLyrics(ctx, lyrics, currentTime) {
		const focusLineFontSize = userConfigs.fontSize;
		const focusLineHeight = focusLineFontSize * 1.2;
		const focusLineMargin = focusLineFontSize * 1;
		const otherLineFontSize = focusLineFontSize * 1;
		const otherLineHeight = otherLineFontSize * 1.2;
		const otherLineMargin = otherLineFontSize * 1;
		const otherLineOpacity = 0.35;
		const marginWidth = ctx.canvas.width * 0.075;
		const animateDuration = userConfigs.smooth ? 0.3 : 0;
		const hCenter = userConfigs.centerAlign;
		const fontFamily = `${userConfigs.fontFamily}, sans-serif`;

		let currentIndex = -1;
		let progress = 1;
		lyrics.forEach(({ startTime }, index) => {
			if (startTime && currentTime > startTime - animateDuration) {
				currentIndex = index;
				if (currentTime < startTime) {
					progress = (currentTime - startTime + animateDuration) / animateDuration;
				}
			}
		});

		if (currentIndex === -1) {
			drawText(ctx, "");
			return;
		}

		const nextState = {
			...userConfigs,
			currentIndex,
			lyrics,
			progress,
		};
		if (isEqualState(nextState, renderState)) return;
		renderState = nextState;

		drawBackground(ctx, userConfigs.backgroundImage);

		const { offscreenCtx, gradient1 } = initOffscreenCtx(ctx);
		offscreenCtx.save();

		// focus line
		const fFontSize = otherLineFontSize + progress * (focusLineFontSize - otherLineFontSize);
		const fLineHeight = otherLineHeight + progress * (focusLineHeight - otherLineHeight);
		const fLineOpacity = otherLineOpacity + progress * (1 - otherLineOpacity);
		const otherRight = ctx.canvas.width - marginWidth - (otherLineFontSize / focusLineFontSize) * (ctx.canvas.width - 2 * marginWidth);
		const progressRight = marginWidth + (1 - progress) * (otherRight - marginWidth);
		offscreenCtx.fillStyle = `rgba(255, 255, 255, ${fLineOpacity})`;
		offscreenCtx.font = `bold ${fFontSize}px ${fontFamily}`;
		const prevLineFocusHeight = drawParagraph(offscreenCtx, lyrics[currentIndex - 1] ? lyrics[currentIndex - 1].text : "", {
			vCenter: true,
			hCenter,
			left: marginWidth,
			right: marginWidth,
			lineHeight: focusLineFontSize,
			measure: true,
		}).height;

		const pos = drawParagraph(offscreenCtx, lyrics[currentIndex].text, {
			vCenter: true,
			hCenter,
			left: marginWidth,
			right: progressRight,
			lineHeight: fLineHeight,
			translateY: (selfHeight) => ((prevLineFocusHeight + selfHeight) / 2 + focusLineMargin) * (1 - progress),
		});
		// offscreenCtx.strokeRect(pos.left, pos.top, pos.width, pos.height);

		// prev line
		let lastBeforePos = pos;
		for (let i = 0; i < currentIndex; i++) {
			if (i === 0) {
				const prevProgressLineFontSize = otherLineFontSize + (1 - progress) * (focusLineFontSize - otherLineFontSize);
				const prevProgressLineOpacity = otherLineOpacity + (1 - progress) * (1 - otherLineOpacity);
				offscreenCtx.fillStyle = `rgba(255, 255, 255, ${prevProgressLineOpacity})`;
				offscreenCtx.font = `bold ${prevProgressLineFontSize}px ${fontFamily}`;
			} else {
				offscreenCtx.fillStyle = `rgba(255, 255, 255, ${otherLineOpacity})`;
				offscreenCtx.font = `bold ${otherLineFontSize}px ${fontFamily}`;
			}
			lastBeforePos = drawParagraph(offscreenCtx, lyrics[currentIndex - 1 - i].text, {
				hCenter,
				bottom: i === 0 ? lastBeforePos.top - focusLineMargin : lastBeforePos.top - otherLineMargin,
				left: marginWidth,
				right: i === 0 ? marginWidth + progress * (otherRight - marginWidth) : otherRight,
				lineHeight: i === 0 ? otherLineHeight + (1 - progress) * (focusLineHeight - otherLineHeight) : otherLineHeight,
			});
			if (lastBeforePos.top < 0) break;
		}
		// next line
		offscreenCtx.fillStyle = `rgba(255, 255, 255, ${otherLineOpacity})`;
		offscreenCtx.font = `bold ${otherLineFontSize}px ${fontFamily}`;
		let lastAfterPos = pos;
		for (let i = currentIndex + 1; i < lyrics.length; i++) {
			lastAfterPos = drawParagraph(offscreenCtx, lyrics[i].text, {
				hCenter,
				top: i === currentIndex + 1 ? lastAfterPos.bottom + focusLineMargin : lastAfterPos.bottom + otherLineMargin,
				left: marginWidth,
				right: otherRight,
				lineHeight: otherLineHeight,
			});
			if (lastAfterPos.bottom > ctx.canvas.height) break;
		}

		offscreenCtx.globalCompositeOperation = "source-in";
		offscreenCtx.fillStyle = gradient1;
		offscreenCtx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		offscreenCtx.restore();
		ctx.drawImage(offscreenCtx.canvas, 0, 0);

		ctx.restore();
	}

	let timeout = null;

	async function tick(options) {
		if (!lyricVideoIsOpen) {
			return;
		}

		if (timeout) clearTimeout(timeout);

		const audio = {
			currentTime: (Player.getProgress() - Number(options.delay)) / 1000,
			duration: Player.getDuration() / 1000,
		};

		const { error, lyrics } = sharedData;

		if (error) {
			if (error === "♪ 전주곡 ♪") {
				drawText(lyricCtx, error);
			} else {
				drawText(lyricCtx, error, "red");
			}
		} else if (!lyrics) {
			drawText(lyricCtx, "가사없음");
		} else if (audio.duration && lyrics.length) {
			renderLyrics(lyricCtx, lyrics, audio.currentTime);
		} else if (!audio.duration || lyrics.length === 0) {
			drawText(lyricCtx, audio.currentSrc ? "로딩중..." : "불러오는중...");
		}

		if (!lyrics?.length) {
			timeout = setTimeout(tick, 1000, options);
			return;
		}

		if (!document.hidden) {
			requestAnimationFrame(() => tick(options));
		}
	}

	function boolLocalStorage(name, defaultVal = true) {
		const value = LocalStorage.get(name);
		return value ? value === "true" : defaultVal;
	}

	let configContainer;

	function openConfig(event) {
		event.preventDefault();

		// Reset on reopen
		if (configContainer) {
			resetTokenButton(configContainer);
		} else {
			configContainer = document.createElement("div");
			configContainer.id = "popup-config-container";
			const style = document.createElement("style");
			style.innerHTML = `
.setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.setting-row::after {
    content: "";
    display: table;
    clear: both;
}
.setting-row .col {
    display: flex;
    padding: 10px 0;
    align-items: center;
}
.setting-row .col.description {
    padding-right: 15px;
    cursor: default;
    width: 50%;
}
.setting-row .col.action {
    justify-content: flex-end;
    width: 50%;
}
.popup-config-col-margin {
    margin-top: 10px;
}
button.switch {
    align-items: center;
    border: 0px;
    border-radius: 50%;
    background-color: rgba(var(--spice-rgb-shadow), .7);
    color: var(--spice-text);
    cursor: pointer;
    display: flex;
    margin-inline-start: 12px;
    padding: 8px;
}
button.switch.disabled,
button.switch[disabled] {
    color: rgba(var(--spice-rgb-text), .3);
}
button.switch.small {
    width: 22px;
    height: 22px;
    padding: 6px;
}
button.btn {
    font-weight: 700;
    display: block;
    background-color: rgba(var(--spice-rgb-shadow), .7);
    border-radius: 500px;
    transition-duration: 33ms;
    transition-property: background-color, border-color, color, box-shadow, filter, transform;
    padding-inline: 15px;
    border: 1px solid #727272;
    color: var(--spice-text);
    min-block-size: 32px;
    cursor: pointer;
}
button.btn:hover {
    transform: scale(1.04);
    border-color: var(--spice-text);
}
button.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
#popup-config-container select {
    color: var(--spice-text);
    background: rgba(var(--spice-rgb-shadow), .7);
    border: 0;
    height: 32px;
}
#popup-config-container input {
    width: 100%;
    padding: 0 5px;
    height: 32px;
    border: 0;
}
#popup-lyrics-delay-input {
    background-color: rgba(var(--spice-rgb-shadow), .7);
    color: var(--spice-text);
}
`;
			const optionHeader = document.createElement("h2");
			optionHeader.innerText = "설정";
			const smooth = createSlider("부드럽게 진행", userConfigs.smooth, (state) => {
				userConfigs.smooth = state;
				LocalStorage.set("popup-lyrics:smooth", String(state));
			});
			const center = createSlider("중앙정렬", userConfigs.centerAlign, (state) => {
				userConfigs.centerAlign = state;
				LocalStorage.set("popup-lyrics:center-align", String(state));
			});
			const cover = createSlider("앨범커버표시", userConfigs.showCover, (state) => {
				userConfigs.showCover = state;
				LocalStorage.set("popup-lyrics:show-cover", String(state));
			});
			const ratio = createOptions("화면비율", { 11: "1:1", 43: "4:3", 169: "16:9" }, userConfigs.ratio, (state) => {
				userConfigs.ratio = state;
				LocalStorage.set("popup-lyrics:ratio", state);
				let value = lyricVideo.width;
				switch (userConfigs.ratio) {
					case "11":
						value = lyricVideo.width;
						break;
					case "43":
						value = Math.round((lyricVideo.width * 3) / 4);
						break;
					case "169":
						value = Math.round((lyricVideo.width * 9) / 16);
						break;
				}
				lyricVideo.height = lyricCanvas.height = value;
				offscreenCtx = null;
			});
			const fontSize = createOptions(
				"폰트크기",
				{
					30: "30px",
					34: "34px",
					38: "38px",
					42: "42px",
					46: "46px",
					50: "50px",
					54: "54px",
					58: "58px",
				},
				String(userConfigs.fontSize),
				(state) => {
					userConfigs.fontSize = Number(state);
					LocalStorage.set("popup-lyrics:font-size", state);
				}
			);
			const blurSize = createOptions(
				"블러크기",
				{
					2: "2px",
					5: "5px",
					10: "10px",
					15: "15px",
				},
				String(userConfigs.blurSize),
				(state) => {
					userConfigs.blurSize = Number(state);
					LocalStorage.set("popup-lyrics:blur-size", state);
				}
			);
			const delay = createOptionsInput("가사싱크", String(userConfigs.delay), (state) => {
				userConfigs.delay = Number(state);
				LocalStorage.set("popup-lyrics:delay", state);
			});
			const clearCache = descriptiveElement(
				createButton("메모리 케시 비우기", "메모리 케시 비우기", () => {
					CACHE = {};
					updateTrack();
				}),
				"불러온 가사는 빠른 재로딩을 위하여 메모리에 캐싱하고 있습니다. Spotify를 다시 시작하지 않고도 메모리에서 캐시된 가사를 지우려면 이 버튼을 누르세요."
			);

			const serviceHeader = document.createElement("h2");
			serviceHeader.innerText = "가사제공";

			const serviceContainer = document.createElement("div");

			function stackServiceElements() {
				userConfigs.servicesOrder.forEach((name, index) => {
					const el = userConfigs.services[name].element;

					const [up, down] = el.querySelectorAll("button");
					if (index === 0) {
						up.disabled = true;
						down.disabled = false;
					} else if (index === userConfigs.servicesOrder.length - 1) {
						up.disabled = false;
						down.disabled = true;
					} else {
						up.disabled = false;
						down.disabled = false;
					}

					serviceContainer.append(el);
				});
			}

			function switchCallback(el, state) {
				const id = el.dataset.id;
				userConfigs.services[id].on = state;
				LocalStorage.set(`popup-lyrics:services:${id}:on`, state);
				updateTrack(true);
			}

			function posCallback(el, dir) {
				const id = el.dataset.id;
				const curPos = userConfigs.servicesOrder.findIndex((val) => val === id);
				const newPos = curPos + dir;

				const temp = userConfigs.servicesOrder[newPos];
				userConfigs.servicesOrder[newPos] = userConfigs.servicesOrder[curPos];
				userConfigs.servicesOrder[curPos] = temp;

				LocalStorage.set("popup-lyrics:services-order", JSON.stringify(userConfigs.servicesOrder));

				stackServiceElements();
				updateTrack(true);
			}

			for (const name of userConfigs.servicesOrder) {
				userConfigs.services[name].element = createServiceOption(name, userConfigs.services[name], switchCallback, posCallback);
			}
			stackServiceElements();

			configContainer.append(
				style,
				optionHeader,
				smooth,
				center,
				cover,
				blurSize,
				fontSize,
				ratio,
				delay,
				clearCache,
				serviceHeader,
				serviceContainer
			);
		}
		Spicetify.PopupModal.display({
			title: "Popup Lyrics",
			content: configContainer,
		});
	}

	function createSlider(name, defaultVal, callback) {
		const container = document.createElement("div");
		container.innerHTML = `
<div class="setting-row">
    <label class="col description">${name}</label>
    <div class="col action"><button class="switch">
        <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
            ${Spicetify.SVGIcons.check}
        </svg>
    </button></div>
</div>`;

		const slider = container.querySelector("button");
		slider.classList.toggle("disabled", !defaultVal);

		slider.onclick = () => {
			const state = slider.classList.contains("disabled");
			slider.classList.toggle("disabled");
			callback(state);
		};

		return container;
	}
	function createOptions(name, options, defaultValue, callback) {
		const container = document.createElement("div");
		container.innerHTML = `
<div class="setting-row">
    <label class="col description">${name}</label>
    <div class="col action">
        <select>
            ${Object.keys(options)
							.map(
								(item) => `
                <option value="${item}" dir="auto">${options[item]}</option>
            `
							)
							.join("\n")}
        </select>
    </div>
</div>`;

		const select = container.querySelector("select");
		select.value = defaultValue;
		select.onchange = (e) => {
			callback(e.target.value);
		};

		return container;
	}
	function createOptionsInput(name, defaultValue, callback) {
		const container = document.createElement("div");
		container.innerHTML = `
    <div class="setting-row">
    <label class="col description">${name}</label>
    <div class="col action">
        <input
          id="popup-lyrics-delay-input"
          type="number"
        />
    </div>
    </div>`;

		const input = container.querySelector("#popup-lyrics-delay-input");
		input.value = defaultValue;
		input.onchange = (e) => {
			callback(e.target.value);
		};

		return container;
	}
	// if name is null, the element can be used without a description.
	function createButton(name, defaultValue, callback) {
		let container;

		if (name) {
			container = document.createElement("div");
			container.innerHTML = `
		<div class="setting-row">
		<label class="col description">${name}</label>
		<div class="col action">
			<button id="popup-lyrics-clickbutton" class="btn">${defaultValue}</button>
		</div>
		</div>`;

			const button = container.querySelector("#popup-lyrics-clickbutton");
			button.onclick = () => {
				callback();
			};
		} else {
			container = document.createElement("button");
			container.innerHTML = defaultValue;
			container.className = "btn ";

			container.onclick = () => {
				callback();
			};
		}

		return container;
	}
	// if name is null, the element can be used without a description.
	function createTextfield(name, defaultValue, placeholder, callback) {
		let container;

		if (name) {
			container = document.createElement("div");
			container.className = "setting-column";
			container.innerHTML = `
			<label class="row-description">${name}</label>
			<div class="popup-row-option action">
				<input id="popup-lyrics-textfield" placeholder="${placeholder}" value="${defaultValue}" />
			</div>`;

			const textfield = container.querySelector("#popup-lyrics-textfield");
			textfield.onchange = () => {
				callback();
			};
		} else {
			container = document.createElement("input");
			container.placeholder = placeholder;
			container.value = defaultValue;

			container.onchange = (e) => {
				callback(e.target.value);
			};
		}

		return container;
	}
	function descriptiveElement(element, description) {
		const desc = document.createElement("span");
		desc.innerHTML = description;
		element.append(desc);
		return element;
	}

	function resetTokenButton(container) {
		const button = container.querySelector("#popup-lyrics-refresh-token");
		if (button) {
			button.innerHTML = "토큰 초기화";
			button.disabled = false;
		}
	}

	function musixmatchTokenElements(defaultVal, id) {
		const button = createButton(null, "토큰 초기화", clickRefresh);
		button.className += "popup-config-col-margin";
		button.id = "popup-lyrics-refresh-token";
		const textfield = createTextfield(null, defaultVal.token, `Place your ${id} token here`, changeTokenfield);
		textfield.className += "popup-config-col-margin";

		function clickRefresh() {
			button.innerHTML = "초기화중...";
			button.disabled = true;

			Spicetify.CosmosAsync.get("https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0", null, {
				authority: "apic-desktop.musixmatch.com",
			})
				.then(({ message: response }) => {
					if (response.header.status_code === 200 && response.body.user_token) {
						button.innerHTML = "토큰이 초기화 됨";
						textfield.value = response.body.user_token;
						textfield.dispatchEvent(new Event("change"));
					} else if (response.header.status_code === 401) {
						button.innerHTML = "너무 많은 요청";
					} else {
						button.innerHTML = "토큰 초기화 실패";
						console.error("토큰 초기화 실패", response);
					}
				})
				.catch((error) => {
					button.innerHTML = "토큰 초기화 실패";
					console.error("토큰 초기화 실패", error);
				});
		}

		function changeTokenfield(value) {
			userConfigs.services.musixmatch.token = value;
			LocalStorage.set("popup-lyrics:services:musixmatch:token", value);
			updateTrack(true);
		}

		const container = document.createElement("div");
		container.append(button);
		container.append(textfield);
		return container;
	}

	function createServiceOption(id, defaultVal, switchCallback, posCallback) {
		const name = id.replace(/^./, (c) => c.toUpperCase());

		const container = document.createElement("div");
		container.dataset.id = id;
		container.innerHTML = `
<div class="setting-row">
    <h3 class="col description">${name}</h3>
    <div class="col action">
        <button class="switch small">
            <svg height="10" width="10" viewBox="0 0 16 16" fill="currentColor">
                ${Spicetify.SVGIcons["chart-up"]}
            </svg>
        </button>
        <button class="switch small">
            <svg height="10" width="10" viewBox="0 0 16 16" fill="currentColor">
                ${Spicetify.SVGIcons["chart-down"]}
            </svg>
        </button>
        <button class="switch">
            <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                ${Spicetify.SVGIcons.check}
            </svg>
        </button>
    </div>
</div>
<span>${defaultVal.desc}</span>`;

		if (id === "musixmatch") {
			container.append(musixmatchTokenElements(defaultVal));
		}

		const [up, down, slider] = container.querySelectorAll("button");

		slider.classList.toggle("disabled", !defaultVal.on);
		slider.onclick = () => {
			const state = slider.classList.contains("disabled");
			slider.classList.toggle("disabled");
			switchCallback(container, state);
		};

		up.onclick = () => posCallback(container, -1);
		down.onclick = () => posCallback(container, 1);

		return container;
	}
}
