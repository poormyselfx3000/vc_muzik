export function shuffled(values) {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i],copy[j]] = [copy[j], copy[i]]
    }
    return copy
}
export class MusicQueue {
    constructor() {
        this.ids = [];
        this.order = [];
        this.position = -1;
        this.random = false
    }
    get current() {
        return this.order[this.position] ?? null
    }
    add(ids) {
        this.ids.push(...ids);
        if (this.random)
            this.order.push(...shuffled(ids));
        else
            this.order.push(...ids);
        if (this.position < 0 && this.order.length)
            this.position = 0
    }
    select(id) {
        if (!this.ids.includes(id))
            throw new Error('Bài hát không tồn tại');
        if (this.random) {
            this.order = [id, ...shuffled(this.ids.filter(x => x !== id))];
            this.position = 0
        } else
            this.position = this.order.indexOf(id);
        return this.current
    }
    setRandom(enabled) {
        const current = this.current;
        this.random = enabled;
        this.order = enabled ? (current === null ? shuffled(this.ids) : [current, ...shuffled(this.ids.filter(x => x !== current))]) : [...this.ids];
        this.position = current === null ? (this.ids.length ? 0 : -1) : this.order.indexOf(current)
    }
    next() {
        if (!this.order.length)
            return null;
        if (this.position + 1 < this.order.length)
            this.position++;
        else {
            const last = this.current;
            if (this.random) {
                this.order = shuffled(this.ids);
                if (this.order.length > 1 && this.order[0] === last)
                    [this.order[0],this.order[1]] = [this.order[1], this.order[0]]
            }
            this.position = 0
        }
        return this.current
    }
    previous() {
        if (!this.order.length)
            return null;
        this.position = Math.max(0, this.position - 1);
        return this.current
    }
    remove(id) {
        const orderIndex = this.order.indexOf(id);
        const wasCurrent = this.current === id;
        const idIndex = this.ids.indexOf(id);
        if (idIndex < 0)
            return null;
        this.ids.splice(idIndex, 1);
        if (orderIndex >= 0)
            this.order.splice(orderIndex, 1);
        if (!this.order.length) {
            this.position = -1;
            return null
        }
        if (orderIndex >= 0 && orderIndex < this.position)
            this.position--;
        if (wasCurrent && this.position >= this.order.length)
            this.position = 0;
        if (this.position < 0)
            this.position = 0;
        return this.current
    }
}
