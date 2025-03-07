const ButtonSVG = ({ icon, active = true, onClick }) => {
	return react.createElement(
		"button",
		{
			className: `switch${active ? "" : " disabled"}`,
			onClick,
		},
		react.createElement("svg", {
			width: 16,
			height: 16,
			viewBox: "0 0 16 16",
			fill: "currentColor",
			dangerouslySetInnerHTML: {
				__html: icon,
			},
		})
	);
};

const SwapButton = ({ icon, disabled, onClick }) => {
	return react.createElement(
		"button",
		{
			className: "switch small",
			onClick,
			disabled,
		},
		react.createElement("svg", {
			width: 10,
			height: 10,
			viewBox: "0 0 16 16",
			fill: "currentColor",
			dangerouslySetInnerHTML: {
				__html: icon,
			},
		})
	);
};

const CacheButton = () => {
	let lyrics = {};

	try {
		const localLyrics = JSON.parse(localStorage.getItem("lyrics-plus:local-lyrics"));
		if (!localLyrics || typeof localLyrics !== "object") {
			throw "";
		}
		lyrics = localLyrics;
	} catch {
		lyrics = {};
	}

	const [count, setCount] = useState(Object.keys(lyrics).length);
	const text = count ? "저장된 모든 가사 지우기" : "저장된 가사 없음";

	return react.createElement(
		"button",
		{
			className: "btn",
			onClick: () => {
				localStorage.removeItem("lyrics-plus:local-lyrics");
				setCount(0);
			},
			disabled: !count,
		},
		text
	);
};

const RefreshTokenButton = ({ setTokenCallback }) => {
	const [buttonText, setButtonText] = useState("토큰 초기화");

	useEffect(() => {
		if (buttonText === "초기화중...") {
			Spicetify.CosmosAsync.get("https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0", null, {
				authority: "apic-desktop.musixmatch.com",
			})
				.then(({ message: response }) => {
					if (response.header.status_code === 200 && response.body.user_token) {
						setTokenCallback(response.body.user_token);
						setButtonText("토큰이 초기화 됨");
					} else if (response.header.status_code === 401) {
						setButtonText("너무 많은 요청");
					} else {
						setButtonText("토큰 초기화 실패");
						console.error("토큰 초기화 실패", response);
					}
				})
				.catch((error) => {
					setButtonText("토큰 초기화 실패");
					console.error("토큰 초기화 실패", error);
				});
		}
	}, [buttonText]);

	return react.createElement(
		"button",
		{
			className: "btn",
			onClick: () => {
				setButtonText("초기화중...");
			},
			disabled: buttonText !== "토큰 초기화",
		},
		buttonText
	);
};

const ConfigButton = ({ name, text, onChange = () => {} }) => {
	return react.createElement(
		"div",
		{
			className: "setting-row",
		},
		react.createElement(
			"label",
			{
				className: "col description",
			},
			name
		),
		react.createElement(
			"div",
			{
				className: "col action",
			},
			react.createElement(
				"button",
				{
					className: "btn",
					onClick: onChange,
				},
				text
			)
		)
	);
};

const ConfigSlider = ({ name, defaultValue, onChange = () => {} }) => {
	const [active, setActive] = useState(defaultValue);

	useEffect(() => {
		setActive(defaultValue);
	}, [defaultValue]);

	const toggleState = useCallback(() => {
		const state = !active;
		setActive(state);
		onChange(state);
	}, [active]);

	return react.createElement(
		"div",
		{
			className: "setting-row",
		},
		react.createElement(
			"label",
			{
				className: "col description",
			},
			name
		),
		react.createElement(
			"div",
			{
				className: "col action",
			},
			react.createElement(ButtonSVG, {
				icon: Spicetify.SVGIcons.check,
				active,
				onClick: toggleState,
			})
		)
	);
};

const ConfigSelection = ({ name, defaultValue, options, onChange = () => {} }) => {
	const [value, setValue] = useState(defaultValue);

	const setValueCallback = useCallback(
		(event) => {
			let value = event.target.value;
			if (!Number.isNaN(Number(value))) {
				value = Number.parseInt(value);
			}
			setValue(value);
			onChange(value);
		},
		[value, options]
	);

	useEffect(() => {
		setValue(defaultValue);
	}, [defaultValue]);

	if (!Object.keys(options).length) return null;

	return react.createElement(
		"div",
		{
			className: "setting-row",
		},
		react.createElement(
			"label",
			{
				className: "col description",
			},
			name
		),
		react.createElement(
			"div",
			{
				className: "col action",
			},
			react.createElement(
				"select",
				{
					className: "main-dropDown-dropDown",
					value,
					onChange: setValueCallback,
				},
				Object.keys(options).map((item) =>
					react.createElement(
						"option",
						{
							value: item,
						},
						options[item]
					)
				)
			)
		)
	);
};

const ConfigInput = ({ name, defaultValue, onChange = () => {} }) => {
	const [value, setValue] = useState(defaultValue);

	const setValueCallback = useCallback(
		(event) => {
			const value = event.target.value;
			setValue(value);
			onChange(value);
		},
		[value]
	);

	return react.createElement(
		"div",
		{
			className: "setting-row",
		},
		react.createElement(
			"label",
			{
				className: "col description",
			},
			name
		),
		react.createElement(
			"div",
			{
				className: "col action",
			},
			react.createElement("input", {
				value,
				onChange: setValueCallback,
			})
		)
	);
};

const ConfigAdjust = ({ name, defaultValue, step, min, max, onChange = () => {} }) => {
	const [value, setValue] = useState(defaultValue);

	function adjust(dir) {
		let temp = value + dir * step;
		if (temp < min) {
			temp = min;
		} else if (temp > max) {
			temp = max;
		}
		setValue(temp);
		onChange(temp);
	}
	return react.createElement(
		"div",
		{
			className: "setting-row",
		},
		react.createElement(
			"label",
			{
				className: "col description",
			},
			name
		),
		react.createElement(
			"div",
			{
				className: "col action",
			},
			react.createElement(SwapButton, {
				icon: `<path d="M2 7h12v2H0z"/>`,
				onClick: () => adjust(-1),
				disabled: value === min,
			}),
			react.createElement(
				"p",
				{
					className: "adjust-value",
				},
				value
			),
			react.createElement(SwapButton, {
				icon: Spicetify.SVGIcons.plus2px,
				onClick: () => adjust(1),
				disabled: value === max,
			})
		)
	);
};

const ConfigHotkey = ({ name, defaultValue, onChange = () => {} }) => {
	const [value, setValue] = useState(defaultValue);
	const [trap] = useState(new Spicetify.Mousetrap());

	function record() {
		trap.handleKey = (character, modifiers, e) => {
			if (e.type === "keydown") {
				const sequence = [...new Set([...modifiers, character])];
				if (sequence.length === 1 && sequence[0] === "esc") {
					onChange("");
					setValue("");
					return;
				}
				setValue(sequence.join("+"));
			}
		};
	}

	function finishRecord() {
		trap.handleKey = () => {};
		onChange(value);
	}

	return react.createElement(
		"div",
		{
			className: "setting-row",
		},
		react.createElement(
			"label",
			{
				className: "col description",
			},
			name
		),
		react.createElement(
			"div",
			{
				className: "col action",
			},
			react.createElement("input", {
				value,
				onFocus: record,
				onBlur: finishRecord,
			})
		)
	);
};

const ServiceAction = ({ item, setTokenCallback }) => {
	switch (item.name) {
		case "local":
			return react.createElement(CacheButton);
		case "musixmatch":
			return react.createElement(RefreshTokenButton, { setTokenCallback });
		default:
			return null;
	}
};

const ServiceOption = ({ item, onToggle, onSwap, isFirst = false, isLast = false, onTokenChange = null }) => {
	const [token, setToken] = useState(item.token);
	const [active, setActive] = useState(item.on);

	const setTokenCallback = useCallback(
		(token) => {
			setToken(token);
			onTokenChange(item.name, token);
		},
		[item.token]
	);

	const toggleActive = useCallback(() => {
		if (item.name === "genius" && spotifyVersion >= "1.2.31") return;
		const state = !active;
		setActive(state);
		onToggle(item.name, state);
	}, [active]);

	return react.createElement(
		"div",
		null,
		react.createElement(
			"div",
			{
				className: "setting-row",
			},
			react.createElement(
				"h3",
				{
					className: "col description",
				},
				item.name
			),
			react.createElement(
				"div",
				{
					className: "col action",
				},
				react.createElement(ServiceAction, {
					item,
					setTokenCallback,
				}),
				react.createElement(SwapButton, {
					icon: Spicetify.SVGIcons["chart-up"],
					onClick: () => onSwap(item.name, -1),
					disabled: isFirst,
				}),
				react.createElement(SwapButton, {
					icon: Spicetify.SVGIcons["chart-down"],
					onClick: () => onSwap(item.name, 1),
					disabled: isLast,
				}),
				react.createElement(ButtonSVG, {
					icon: Spicetify.SVGIcons.check,
					active,
					onClick: toggleActive,
				})
			)
		),
		react.createElement("span", {
			dangerouslySetInnerHTML: {
				__html: item.desc,
			},
		}),
		item.token !== undefined &&
			react.createElement("input", {
				placeholder: `Place your ${item.name} token here`,
				value: token,
				onChange: (event) => setTokenCallback(event.target.value),
			})
	);
};

const ServiceList = ({ itemsList, onListChange = () => {}, onToggle = () => {}, onTokenChange = () => {} }) => {
	const [items, setItems] = useState(itemsList);
	const maxIndex = items.length - 1;

	const onSwap = useCallback(
		(name, direction) => {
			const curPos = items.findIndex((val) => val === name);
			const newPos = curPos + direction;
			[items[curPos], items[newPos]] = [items[newPos], items[curPos]];
			onListChange(items);
			setItems([...items]);
		},
		[items]
	);

	return items.map((key, index) => {
		const item = CONFIG.providers[key];
		item.name = key;
		return react.createElement(ServiceOption, {
			item,
			key,
			isFirst: index === 0,
			isLast: index === maxIndex,
			onSwap,
			onTokenChange,
			onToggle,
		});
	});
};

const corsProxyTemplate = () => {
	const [proxyValue, setProxyValue] = react.useState(localStorage.getItem("spicetify:corsProxyTemplate") || "https://cors-proxy.spicetify.app/{url}");

	return react.createElement("input", {
		placeholder: "CORS 프록시 설정",
		value: proxyValue,
		onChange: (event) => {
			const value = event.target.value;
			setProxyValue(value);

			if (value === "" || !value) return localStorage.removeItem("spicetify:corsProxyTemplate");
			localStorage.setItem("spicetify:corsProxyTemplate", value);
		},
	});
};

const OptionList = ({ type, items, onChange }) => {
	const [itemList, setItemList] = useState(items);
	const [, forceUpdate] = useState();

	useEffect(() => {
		if (!type) return;

		const eventListener = (event) => {
			if (event.detail?.type !== type) return;
			setItemList(event.detail.items);
		};
		document.addEventListener("lyrics-plus", eventListener);

		return () => document.removeEventListener("lyrics-plus", eventListener);
	}, []);

	return itemList.map((item) => {
		if (!item || (item.when && !item.when())) {
			return;
		}

		const onChangeItem = item.onChange || onChange;

		return react.createElement(
			"div",
			null,
			react.createElement(item.type, {
				...item,
				name: item.desc,
				defaultValue: CONFIG.visual[item.key],
				onChange: (value) => {
					onChangeItem(item.key, value);
					forceUpdate({});
				},
			}),
			item.info &&
				react.createElement("span", {
					dangerouslySetInnerHTML: {
						__html: item.info,
					},
				})
		);
	});
};

const languageCodes =
	"none,en,af,ar,bg,bn,ca,zh,cs,da,de,el,es,et,fa,fi,fr,gu,he,hi,hr,hu,id,is,it,ja,jv,kn,ko,lt,lv,ml,mr,ms,nl,no,pl,pt,ro,ru,sk,sl,sr,su,sv,ta,te,th,tr,uk,ur,vi,zu".split(
		","
	);

const displayNames = new Intl.DisplayNames(["ko"], { type: "language" });
const languageOptions = languageCodes.reduce((acc, code) => {
	acc[code] = code === "none" ? "None" : displayNames.of(code);
	return acc;
}, {});

function openConfig() {
	const configContainer = react.createElement(
		"div",
		{
			id: `${APP_NAME}-config-container`,
		},
		react.createElement("h2", null, "설정"),
		react.createElement(OptionList, {
			items: [
				{
					desc: "기존 가사 버튼 대체",
					key: "playbar-button",
					info: "Spotify의 가사 버튼을 가사+로 대체합니다.",
					type: ConfigSlider,
				},
				{
					desc: "가사싱크",
					info: "모든 트랙의 가사 싱크 오프셋을 조정합니다.",
					key: "global-delay",
					type: ConfigAdjust,
					min: -10000,
					max: 10000,
					step: 250,
				},
				{
					desc: "폰트크기",
					info: "(Ctrl + 마우스휠로 조정가능)",
					key: "font-size",
					type: ConfigAdjust,
					min: fontSizeLimit.min,
					max: fontSizeLimit.max,
					step: fontSizeLimit.step,
				},
				{
					desc: "정렬",
					key: "alignment",
					type: ConfigSelection,
					options: {
						left: "왼쪽",
						center: "중앙",
						right: "오른쪽",
					},
				},
				{
					desc: "전체화면 키",
					key: "fullscreen-key",
					type: ConfigHotkey,
				},
				{
					desc: "표시개수: 현재 라인 이전",
					key: "lines-before",
					type: ConfigSelection,
					options: [0, 1, 2, 3, 4],
				},
				{
					desc: "표시개수: 현재 라인 이후",
					key: "lines-after",
					type: ConfigSelection,
					options: [0, 1, 2, 3, 4],
				},
				{
					desc: "블러 효과",
					key: "fade-blur",
					type: ConfigSlider,
				},
				{
					desc: "노이즈 오버레이",
					key: "noise",
					type: ConfigSlider,
				},
				{
					desc: "배경 색 자동전환",
					key: "colorful",
					type: ConfigSlider,
				},
				{
					desc: "배경 색상",
					key: "background-color",
					type: ConfigInput,
					when: () => !CONFIG.visual.colorful,
				},
				{
					desc: "활성 상태 색상",
					key: "active-color",
					type: ConfigInput,
					when: () => !CONFIG.visual.colorful,
				},
				{
					desc: "비활성 상태 색상",
					key: "inactive-color",
					type: ConfigInput,
					when: () => !CONFIG.visual.colorful,
				},
				{
					desc: "텍스트 배경 강조 색상",
					key: "highlight-color",
					type: ConfigInput,
					when: () => !CONFIG.visual.colorful,
				},
				{
					desc: "텍스트 변환: 일본어 감지 임계값(고급)",
					info: "일본어가 가사에서 빈도가 높은지 확인합니다. 결과가 임계값을 통과하면 일본어일 가능성이 높으며 그 반대의 경우도 마찬가지입니다. 이 설정은 백분율입니다.",
					key: "ja-detect-threshold",
					type: ConfigAdjust,
					min: thresholdSizeLimit.min,
					max: thresholdSizeLimit.max,
					step: thresholdSizeLimit.step,
				},
				{
					desc: "텍스트 변환: 번체-간체 감지 임계값(고급)",
					info: "가사에서 번체 또는 간체가 빈도가 높은지 확인합니다. 결과가 임계값을 통과하면 간체일 가능성이 높으며 그 반대의 경우도 마찬가지입니다. 이 설정은 백분율입니다.",
					key: "hans-detect-threshold",
					type: ConfigAdjust,
					min: thresholdSizeLimit.min,
					max: thresholdSizeLimit.max,
					step: thresholdSizeLimit.step,
				},
				{
					desc: "Musixmatch 번역",
					info: "가사가 Musixmatch 제공자로 로드된 경우, 원하는 언어로 번역해 보세요. 언어를 선택하면 가사가 새로고침됩니다.",
					key: "musixmatch-translation-language",
					type: ConfigSelection,
					options: languageOptions,
				},
				{
					desc: "메모리 케시 비우기",
					info: "불러온 가사는 빠른 재로딩을 위하여 메모리에 캐싱하고 있습니다. Spotify를 다시 시작하지 않고도 메모리에서 캐시된 가사를 지우려면 이 버튼을 누르세요.",
					key: "clear-memore-cache",
					text: "메모리 케시 비우기",
					type: ConfigButton,
					onChange: () => {
						reloadLyrics?.();
					},
				},
			],
			onChange: (name, value) => {
				CONFIG.visual[name] = value;
				localStorage.setItem(`${APP_NAME}:visual:${name}`, value);

				// Reload Lyrics if translation language is changed
				if (name === "musixmatch-translation-language") {
					if (value === "none") {
						CONFIG.visual["translate:translated-lyrics-source"] = "none";
						localStorage.setItem(`${APP_NAME}:visual:translate:translated-lyrics-source`, "none");
					}
					reloadLyrics?.();
				} else {
					lyricContainerUpdate?.();
				}

				const configChange = new CustomEvent("lyrics-plus", {
					detail: {
						type: "config",
						name: name,
						value: value,
					},
				});
				window.dispatchEvent(configChange);
			},
		}),
		react.createElement("h2", null, "가사제공"),
		react.createElement(ServiceList, {
			itemsList: CONFIG.providersOrder,
			onListChange: (list) => {
				CONFIG.providersOrder = list;
				localStorage.setItem(`${APP_NAME}:services-order`, JSON.stringify(list));
				reloadLyrics?.();
			},
			onToggle: (name, value) => {
				CONFIG.providers[name].on = value;
				localStorage.setItem(`${APP_NAME}:provider:${name}:on`, value);
				reloadLyrics?.();
			},
			onTokenChange: (name, value) => {
				CONFIG.providers[name].token = value;
				localStorage.setItem(`${APP_NAME}:provider:${name}:token`, value);
				reloadLyrics?.();
			},
		}),
		react.createElement("h2", null, "CORS 프록시 설정"),
		react.createElement("span", {
			dangerouslySetInnerHTML: {
				__html:
					"CORS 제한을 우회하기 위해 사용합니다. 아래 URL을 수정하여 CORS 프록시 서버를 변경합니다. <code>{url}</code>은 요청 URL로 대체됩니다.",
			},
		}),
		react.createElement(corsProxyTemplate),
		react.createElement("span", {
			dangerouslySetInnerHTML: {
				__html: "적용 후 Spotify가 웹뷰를 다시 로드합니다. 값을 비워두면 기본값으로 대체됩니다: <code>https://cors-proxy.spicetify.app/{url}</code>",
			},
		})
	);

	Spicetify.PopupModal.display({
		title: "가사+",
		content: configContainer,
		isLarge: true,
	});
}
