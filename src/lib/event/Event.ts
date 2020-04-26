import * as is from 'is'

const eventFactory = Cls => {
    const $listeners = {}
    let INDEX = 1
    const createSymbol = () => `SYMBOL_${INDEX++}`
    // 普通触发
    Cls.prototype.emit = async function (name, ...arg) {
        let list: any[] = $listeners[name] || []
        let update = []
        for (let i = 0; i < list.length; i++) {
            let it = list[i]
            let buildRunAction = action => new Promise(async (r) => {
                let ret = await action(...arg)
                return r(ret)
            })
            let result = buildRunAction(it.listener)
            await new Promise(async (r) => {
                result.then(r).catch(e => {
                    this.emit('error', e)
                    r()
                })
            })
            if (it.times !== 1) {
                update.push(it)
            }
        }
        $listeners[name] = update
    }
    Cls.prototype.once = function (name, listener) {
        let isAllow = name && is.function(listener)
        if (!isAllow) {
            throw new Error('Listener must be function')
        }
        $listeners[name] = $listeners[name] || []
        return $listeners[name].push({
            times: 1,
            listener

        })
    }
    Cls.prototype.on = function (name, listener) {
        let isAllow = name && is.function(listener)
        if (!isAllow) {
            throw new Error('Listener must be function')
        }
        $listeners[name] = $listeners[name] || []
        return $listeners[name].push({
            times: Infinity,
            listener
        })
    }
    Cls.prototype.subscribe = function (name, listener) {
        let isAllow = name && is.function(listener)
        if (!isAllow) {
            throw new Error('Listener must be function')
        }
        $listeners[name] = $listeners[name] || []
        const symbol = createSymbol()
        $listeners[name].push({
            times: Infinity,
            listener,
            symbol
        })
        return () => {
            $listeners[name] = $listeners[name].filter(it => it.symbol !== symbol)
        }
    }
    return Cls
}
export { eventFactory }

class Base {
    $listeners = [];
    $uninstallWorkerMaper = [];
    onDestroy() {
        if (is.array(this.$uninstallWorkerMaper)) {
            this.$uninstallWorkerMaper.forEach(fn => fn())
        }
    }
    constructor() {
        this.$listeners.map((mListener) => {
            let { type, name, listener } = mListener
            let fn = this[type](name, listener.bind(this))
            if (type == "subscribe" && is.function(fn)) {
                this.$uninstallWorkerMaper.push(fn)
            }
        })
    }
}
let EventBase = eventFactory(Base)
export default EventBase
function setListener(param?: string) {
    let Reg: RegExp = /(.+)\@(.+)/;
    if (Reg.test(param)) {
        return (target: Object,
            propertyKey: string,
            descriptor: TypedPropertyDescriptor<any>) => {
            if (!target["$listeners"]) {
                target["$listeners"] = [{ type: RegExp.$1, name: RegExp.$2, listener: target[propertyKey] }]
            } else {
                target["$listeners"].push({ type: RegExp.$1, name: RegExp.$2, listener: target[propertyKey] });
            }
            return descriptor;
        }
    } else {
        throw new Error("Event:setListener:Illegal entry")
    }

}
export { setListener }

export const connectReact = (cls) => {
    let mEvent = new EventBase();
    let componentWillMount = cls.prototype.componentWillMount
    let componentWillUnmount = cls.prototype.componentWillUnmount
    cls.prototype.componentWillMount = async function (...arg) {
        let $listeners = this.$listeners
        if (is.array($listeners)) {
            $listeners.map((l) => {
                let { type, name, listener } = l;
                let fn = mEvent[type](name, listener.bind(this));
                if (type == "subscribe" && is.function(fn)) {
                    !this.$uninstallWorkerMaper && (this.$uninstallWorkerMaper = [])
                    this.$uninstallWorkerMaper.push(fn)
                }
            })
        }
        return is.function(componentWillMount) ? await componentWillMount.call(this, ...arg) : null
    }
    cls.prototype.componentWillUnmount = async function (...arg) {
        if (is.array(this.$uninstallWorkerMaper)) {
            this.$uninstallWorkerMaper.forEach(fn => fn())
        }
        return is.function(componentWillUnmount) ? await componentWillUnmount.call(this, ...arg) : null
    }
    return cls
}

