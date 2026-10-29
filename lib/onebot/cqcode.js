"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CQCode = CQCode;
// see https://github.com/koishijs/koishi-plugin-adapter-onebot/blob/main/src/bot/cqcode.ts#L3
const koishi_1 = require("koishi");
function CQCode(type, attrs) {
    if (type === 'text')
        return attrs.content;
    let output = '[CQ:' + type;
    for (const key in attrs) {
        if (attrs[key])
            output += `,${key}=${koishi_1.h.escape(attrs[key], true)}`;
    }
    return output + ']';
}
// eslint-disable-next-line @typescript-eslint/no-namespace
(function (CQCode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function escape(source, inline = false) {
        const result = String(source)
            .replace(/&/g, '&amp;')
            .replace(/\[/g, '&#91;')
            .replace(/\]/g, '&#93;');
        return inline
            ? result
                .replace(/,/g, '&#44;')
                .replace(/(\ud83c[\udf00-\udfff])|(\ud83d[\udc00-\ude4f\ude80-\udeff])|[\u2600-\u2B55]/g, ' ')
            : result;
    }
    CQCode.escape = escape;
    function unescape(source) {
        return String(source)
            .replace(/&#91;/g, '[')
            .replace(/&#93;/g, ']')
            .replace(/&#44;/g, ',')
            .replace(/&amp;/g, '&');
    }
    CQCode.unescape = unescape;
    const pattern = /\[CQ:(\w+)((,\w+=[^,\]]*)*)\]/;
    function from(source) {
        const capture = pattern.exec(source);
        if (!capture)
            return null;
        const [, type, attrs] = capture;
        const data = {};
        attrs &&
            attrs
                .slice(1)
                .split(',')
                .forEach((str) => {
                const index = str.indexOf('=');
                data[str.slice(0, index)] = unescape(str.slice(index + 1));
            });
        return { type, data, capture };
    }
    CQCode.from = from;
    function parse(source) {
        if (typeof source !== 'string') {
            return source.map(({ type, data }) => {
                if (type === 'text') {
                    return (0, koishi_1.h)('text', { content: data.text });
                }
                else if (type === 'image') {
                    return (0, koishi_1.h)('img', data);
                }
                else if (type === 'replay') {
                    return (0, koishi_1.h)('quote', { id: data.qq });
                }
                else {
                    return (0, koishi_1.h)(type, data);
                }
            });
        }
        const elements = [];
        let result;
        while ((result = from(source))) {
            const { type, data, capture } = result;
            if (capture.index) {
                elements.push((0, koishi_1.h)('text', {
                    content: unescape(source.slice(0, capture.index))
                }));
            }
            elements.push((0, koishi_1.h)(type, data));
            source = source.slice(capture.index + capture[0].length);
        }
        if (source)
            elements.push((0, koishi_1.h)('text', { content: unescape(source) }));
        return elements;
    }
    CQCode.parse = parse;
})(CQCode || (exports.CQCode = CQCode = {}));
//# sourceMappingURL=cqcode.js.map