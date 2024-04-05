import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { normalizePath } from 'obsidian';
const { XMLParser } = require("fast-xml-parser");
// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	username: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	username: 'default'
}

export default class LetterboxdPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'letterboxd-sync',
			name: 'Sync Letterboxd Diary',
			callback: async () => {
				if (!this.settings.username) {
					throw new Error('Cannot get data for blank username')
				}
				fetch(`https://us-central1-redside-shiner.cloudfunctions.net/proxy?url=https://letterboxd.com/${this.settings.username}/rss/`)
					.then(res => res.text())
					.then(async res => {
						const parser = new XMLParser();
						let jObj = parser.parse(res);
						const filename = normalizePath('/Letterboxd Diary.md')
						const diaryMdArr = jObj.rss.channel.item.map(item => {
							return `- Gave [${item['letterboxd:memberRating']} stars to ${item['letterboxd:filmTitle']}](${item['link']}) on [[${item['letterboxd:watchedDate']}]]`
						})
						const diaryFile = this.app.vault.getFileByPath(filename)
						if (diaryFile === null) {
							this.app.vault.create(filename, `${diaryMdArr.join('\n')}`)
						} else {
							this.app.vault.process(diaryFile, (data) => {
								const diaryContentsArr = data.split('\n')
								const diaryContentsSet = new Set(diaryContentsArr)
								diaryMdArr.forEach(entry => diaryContentsSet.add(entry))
								return `${[...diaryContentsSet].join('\n')}`
							})
						}
					})
			},
		})

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: LetterboxdPlugin;
	settings: any

	constructor(app: App, plugin: LetterboxdPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		this.settings = this.plugin.loadData()

		containerEl.empty();

		new Setting(containerEl)
			.setName('Letterboxd Username')
			.setDesc('This is the username which we will use to fetch Letterboxd entries. It must be public.')
			.addText((component) => {
				component.setPlaceholder('myusername')
				component.setValue(this.plugin.settings.username)
				component.onChange(async (value) => {
					this.plugin.settings.username = value
					await this.plugin.saveSettings()
				})
			})
	}
}
