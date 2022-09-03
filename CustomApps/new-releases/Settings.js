const ButtonSVG = ({ icon, active = true, onClick }) => {
    return react.createElement(
        "button",
        {
            className: "switch" + (active ? "" : " disabled"),
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

const ButtonText = ({ text, active = true, onClick }) => {
    return react.createElement(
        "button",
        {
            className: "text" + (active ? "" : " disabled"),
            onClick,
        },
        text
    );
};

const ConfigSlider = ({ name, defaultValue, onChange = () => {} }) => {
    const [active, setActive] = useState(defaultValue);

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
            react.createElement(
                "select",
                {
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

const OptionList = ({ items, onChange }) => {
    const [_, setItems] = useState(items);
    return items.map((item) => {
        if (!item.when()) {
            return;
        }
        return react.createElement(item.type, {
            name: item.desc,
            defaultValue: item.defaultValue,
            options: item.options,
            onChange: (value) => {
                onChange(item.key, value);
                setItems([...items]);
            },
        });
    });
};

function openConfig() {
    const configContainer = react.createElement(
        "div",
        {
            id: `${APP_NAME}-config-container`,
        },
        react.createElement(OptionList, {
            items: [
                {
                    desc: "기간설정",
                    key: "range",
                    defaultValue: CONFIG["range"],
                    type: ConfigSelection,
                    options: {
                        30: "30 일",
                        60: "60 일",
                        90: "90 일",
                        120: "120 일",
                    },
                    when: () => true,
                },
                {
                    desc: "표기언어",
                    key: "locale",
                    defaultValue: CONFIG.locale,
                    type: ConfigInput,
                    when: () => true,
                },
                {
                    desc: "상대적시간",
                    key: "relative",
                    defaultValue: CONFIG.relative,
                    type: ConfigSlider,
                    when: () => true,
                },
                {
                    desc: "유형",
                    key: "visual:type",
                    defaultValue: CONFIG.visual.type,
                    type: ConfigSlider,
                    when: () => true,
                },
                {
                    desc: "곡 개수",
                    key: "visual:count",
                    defaultValue: CONFIG.visual.count,
                    type: ConfigSlider,
                    when: () => true,
                },
                {
                    desc: "새 팟캐스트",
                    key: "podcast",
                    defaultValue: CONFIG["podcast"],
                    type: ConfigSlider,
                    when: () => true,
                },
                {
                    desc: "새 음악",
                    key: "music",
                    defaultValue: CONFIG["music"],
                    type: ConfigSlider,
                    when: () => true,
                },
                {
                    desc: Spicetify.Locale.get("artist.albums"),
                    key: "album",
                    defaultValue: CONFIG["album"],
                    type: ConfigSlider,
                    when: () => CONFIG["music"],
                },
                {
                    desc: Spicetify.Locale.get("artist.singles"),
                    key: "single-ep",
                    defaultValue: CONFIG["single-ep"],
                    type: ConfigSlider,
                    when: () => CONFIG["music"],
                },
                {
                    desc: Spicetify.Locale.get("artist.appears-on"),
                    key: "appears-on",
                    defaultValue: CONFIG["appears-on"],
                    type: ConfigSlider,
                    when: () => CONFIG["music"],
                },
                {
                    desc: Spicetify.Locale.get("artist.compilations"),
                    key: "compilations",
                    defaultValue: CONFIG["compilations"],
                    type: ConfigSlider,
                    when: () => CONFIG["music"],
                },
            ],
            onChange: (name, value) => {
                const subs = name.split(":");
                if (subs.length > 1) {
                    CONFIG[subs[0]][subs[1]] = value;
                    gridUpdatePostsVisual();
                } else {
                    CONFIG[name] = value;
                }
                localStorage.setItem(`${APP_NAME}:${name}`, value);
            },
        })
    );

    Spicetify.PopupModal.display({
        title: Spicetify.Locale.get("new_releases"),
        content: configContainer,
    });
}
