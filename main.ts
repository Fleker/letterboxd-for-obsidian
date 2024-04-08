import { App, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import { normalizePath } from 'obsidian';
const { XMLParser } = require("fast-xml-parser");
// Remember to rename these classes and interfaces!

interface LetterboxdSettings {
	username: string;
}

/**
 * Represents one item in the Letterboxd RSS feed
 * 
 * @example
 * ```
 * {
 *  "title": "Ahsoka, 2023 - ★★★★",
 *  "link": "https://letterboxd.com/fleker/film/ahsoka/",
 *  "guid": "letterboxd-review-568742403",
 *  "pubDate": "Thu, 4 Apr 2024 17:28:09 +1300",
 *  "letterboxd:watchedDate": "2024-04-04",
 *  "letterboxd:rewatch": "No",
 *  "letterboxd:filmTitle": "Ahsoka",
 *  "letterboxd:filmYear": 2023,
 *  "letterboxd:memberRating": 4,
 *  "tmdb:tvId": 114461,
 *  "description": "<p><img src=\"https://a.ltrbxd.com/resized/film-poster/1/0/5/5/4/3/0/1055430-ahsoka-0-600-0-900-crop.jpg?v=b8ec715c15\"/></p> <p>...</p> ",
 *  "dc:creator": "fleker"
 * },
 * ```
 */
interface RSSEntry {
	title: string
	link: string
	guid: string
	pubDate: string
	'letterboxd:watchedDate': string
	'letterboxd:rewatch': string
	'letterboxd:filmTitle': string
	'letterboxd:filmYear': number
	'letterboxd:memberRating': number
	'tmdb:tvId': number
	description: string
	'dc:creator': string
}

const DEFAULT_SETTINGS: LetterboxdSettings = {
	username: 'default'
}

export default class LetterboxdPlugin extends Plugin {
	settings: LetterboxdSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'letterboxd-sync',
			name: 'Sync Letterboxd Diary',
			callback: async () => {
				if (!this.settings.username) {
					throw new Error('Cannot get data for blank username')
				}
				requestUrl(`https://letterboxd.com/${this.settings.username}/rss/`)
					.then(res => res.text)
					.then(async res => {
						const parser = new XMLParser();
						let jObj = parser.parse(res);
						const filename = normalizePath('/Letterboxd Diary.md')
						const diaryMdArr = jObj.rss.channel.item.map((item: RSSEntry) => {
							return `- Gave [${item['letterboxd:memberRating']} stars to ${item['letterboxd:filmTitle']}](${item['link']}) on [[${item['letterboxd:watchedDate']}]]`
						})
						const diaryFile = this.app.vault.getFileByPath(filename)
						if (diaryFile === null) {
							this.app.vault.create(filename, `${diaryMdArr.join('\n')}`)
						} else {
							this.app.vault.process(diaryFile, (data) => {
								const diaryContentsArr = data.split('\n')
								const diaryContentsSet = new Set(diaryContentsArr)
								diaryMdArr.forEach((entry: string) => diaryContentsSet.add(entry))
								return `${[...diaryContentsSet].join('\n')}`
							})
						}
					})
			},
		})

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LetterboxdSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class LetterboxdSettingTab extends PluginSettingTab {
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
			.setDesc('The username to fetch data from. This account must be public.')
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
