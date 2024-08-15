import { App, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import { normalizePath } from 'obsidian';
import { XMLParser } from 'fast-xml-parser';

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
	username: ''
}

export default class LetterboxdPlugin extends Plugin {
	settings: LetterboxdSettings;
	async onload() {
		await this.loadSettings();
		this.addCommand({
			id: 'sync',
			name: 'Pull newest entries',
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
						const diaryMdArr = (jObj.rss.channel.item as RSSEntry[])
								.sort((a, b) => a.pubDate.localeCompare(b.pubDate)) // Sort by date
								.map((item: RSSEntry) => {
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
		this.addCommand({
			id:"add-last-movie",
			name: "Add Last watched movie",
				callback: async () => {
				if (!this.settings.username) {
					throw new Error('Cannot get data for blank username')
				}
				requestUrl(`https://letterboxd.com/${this.settings.username}/rss/`)
					.then(res => res.text)
					.then(async res => {
						const parser1 = new XMLParser();
						let jObj1 = parser1.parse(res);
						console.log(jObj1)
						let item = jObj1.rss.channel.item[0] 
						this.app.workspace.activeEditor?.editor?.replaceRange(
							`>[!Last Movie Logged]+ \n> ${item['title']} on ${item['letterboxd:watchedDate']} \n> ${item['description']}  ` ,
							this.app.workspace.activeEditor.editor.getCursor()
						);
					})
			},
		})
		this.addCommand({
			id:"add-last-2-movies",
			name: "Add Last 2 watched movie",
				callback: async () => {
				if (!this.settings.username) {
					throw new Error('Cannot get data for blank username')
				}
				requestUrl(`https://letterboxd.com/${this.settings.username}/rss/`)
					.then(res => res.text)
					.then(async res => {
						const parser1 = new XMLParser();
						let jObj1 = parser1.parse(res);
						console.log(jObj1)
						let items = [jObj1.rss.channel.item[0],jObj1.rss.channel.item[1]] 
						var text = ">[!Last two Movies Logged]+ \n"
						for (var item of items) {
							text=text+`> ${item['title']} on ${item['letterboxd:watchedDate']} \n> ${item['description']}  `
						}
						this.app.workspace.activeEditor?.editor?.replaceRange(
							text ,
							this.app.workspace.activeEditor.editor.getCursor()
						);
					})
			},
		})
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
			.setName('Letterboxd username')
			.setDesc('The username to fetch data from. This account must be public.')
			.addText((component) => {
				component.setPlaceholder('username')
				component.setValue(this.plugin.settings.username)
				component.onChange(async (value) => {
					this.plugin.settings.username = value
					await this.plugin.saveSettings()
				})
			})
	}
}
