const { Plugin } = require("powercord/entities");
const { getModule, constants: { Permissions } } = require("powercord/webpack");
const { inject, uninject } = require("powercord/injector");

module.exports = class ShowHiddenChannels extends Plugin {
	async import(filter, functionName = filter) {
		if (typeof filter === "string") filter = [filter];
		this[functionName] = (await getModule(filter))[functionName];
	}
	async doImport() {
		await this.import("getMember");
		await this.import("getGuild");
		await this.import("getCurrentUser");
		await this.import("getGuildChannels");
		await this.import("getChannel");
		await this.import(["getGuildId", "getLastSelectedGuildId"], "getGuildId");
		await this.import("getChannelPermissions");
		await this.import(["Permissions", "ActivityTypes"], "ChannelTypes");
	}
	noHiddenChannels = {
		send: false,
		result: "```\nNo hidden channels.\n```"
	}
	async startPlugin() {
		await this.doImport();
		this.hiddenChannelCache = {};
		powercord.api.commands.registerCommand({
			command: "hiddenchannels",
			description: "Show hidden channels for the current guild",
			usage: "{c}",
			executor: () => {
				let guild = this.getGuild(this.getGuildId());
				let channels = this._getHiddenChannels(guild);
				if (channels[1] === 0) return this.noHiddenChannels;
				channels = Object.values(channels[0]).reduce((t, v) => t.concat(v), []);
				let categories = [];
				let out = "```\n";
				for (var i = 0; i < channels.length; i++) {
					let c = this.getChannel(channels[i].parent_id);
					if (c && !categories.includes(c)) categories.push(c);
				}
				channels.sort(this._positionSort, []);
				categories.sort(this._positionSort, []);
				if (channels.filter(c => !c.parent_id).length !== 0) out += "Category-less:\n";
				for (var i = 0; i < channels.length; i++) {
					let v = channels[i];
					if (v.parent_id) break;
					out += this._makeChannelLine(v);
				}
				for (var a = 0; a < categories.length; a++) {
					let c = categories[a];
					out += `${c.name}:\n`;
					for (var b = 0; b < channels.length; b++) {
						let v = channels[b];
						if (v.parent_id === c.id)
							out += this._makeChannelLine(v);
					}
				}
				out += "```";
				return {
					send: false,
					result: out
				}
			}
		});
	}
	pluginWillUnload() {
		powercord.api.commands.unregisterCommand("hiddenchannels");
	}
	_getHiddenChannels(guild) {
		if (!guild) return [{}, 0];
		let roles = (this.getMember(guild.id, this.getCurrentUser().id) || {roles: []}).roles.length;
		if (this.hiddenChannelCache[guild.id] && this.hiddenChannelCache[guild.id].roles === roles)
			return [this.hiddenChannelCache[guild.id].hidden, this.hiddenChannelCache[guild.id].amount];
		let all = this.getGuildChannels(), hidden = {}, amount = 0;
		for (let type in this.ChannelTypes) hidden[this.ChannelTypes[type]] = [];
		for (let channel_id in all) {
			let channel = all[channel_id];
			if (channel.guild_id === guild.id && channel.type !== (4 || 1) && !this._hasPermission(Permissions.VIEW_CHANNEL, channel.id)) {
				amount++;
				hidden[channel.type].push(channel);
			}
		}
		this.hiddenChannelCache[guild.id] = {hidden, amount, roles};
		return [hidden, amount];
	}
	_hasPermission(permission, channelId) {
		const permissions = this.getChannelPermissions(channelId);
		return permissions && (permissions & permission) !== 0;
	}
	_isHiddenChannel(channelId) {
		let channel = this.getChannel(channelId);
		return channel &&
			this.hiddenChannelCache[channel.guild_id] &&
			this.hiddenChannelCache[channel.guild_id].hidden[channel.type] &&
			this.hiddenChannelCache[channel.guild_id].hidden[channel.type].find(c => c.id === channel.id);
	}
	_makeChannelLine = v => `   ${v.type === this.ChannelTypes["GUILD_VOICE"] ? "VC - " : ""}#${v.name}${v.nsfw ? " - NSFW" : ""}\n`
	_positionSort = (a, b) => a.position < b.position ? -1 : (a.position > b.position ? 1 : 0)
}
