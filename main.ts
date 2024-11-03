import { App, Component, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import { normalizePath, moment } from 'obsidian';
import { XMLParser } from 'fast-xml-parser';
import {
	getDailyNoteSettings
} from "obsidian-daily-notes-interface";


interface LetterboxdSettings {
	username: string;
	dateFormat: string;
	folder: string;
	fileName: string;
	sort: string;
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
	username: '',
	dateFormat: getDailyNoteSettings().format ?? '',
	folder: '',
	fileName: 'Letterboxd Diary',
	sort: 'Old'
}

const decodeHtmlEntities = (text: string) => {
	const txt = document.createElement("textarea");
	txt.innerHTML = text;
	return txt.value;
};

const objToFrontmatter = (obj: Record<string, any>): string => {
	let yamlString = '---\n';
	for (const key in obj) {
		if (Array.isArray(obj[key])) {
			yamlString += `${key}:\n`; // Add key with a colon for arrays
			obj[key].forEach(value => {
				yamlString += `  - ${value}\n`; // Indent array values
			});
		} else {
			yamlString += `${key}: ${obj[key]}\n`; // Key-value pair
		}
	}
	return yamlString += '---\n';
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
						const filename = normalizePath(`${this.settings.folder}/${this.settings.fileName}.md`);
						const diaryMdArr = (jObj.rss.channel.item as RSSEntry[])
							.sort((a, b) => {
								const dateA = new Date(a.pubDate).getTime();
								const dateB = new Date(b.pubDate).getTime();
								return this.settings.sort === 'Old' ? dateA - dateB : dateB - dateA;
							})
							.map((item: RSSEntry) => {
								const filmTitle = decodeHtmlEntities(item['letterboxd:filmTitle']);
								const watchedDate = this.settings.dateFormat
									? moment(item['letterboxd:watchedDate']).format(this.settings.dateFormat)
									: item['letterboxd:watchedDate'];

								return item['letterboxd:memberRating'] !== undefined
									? `- Gave [${item['letterboxd:memberRating']} stars to ${filmTitle}](${item['link']}) on [[${watchedDate}]]`
									: `- Watched [${filmTitle}](${item['link']}) on [[${watchedDate}]]`;
							})
						const diaryFile = this.app.vault.getFileByPath(filename)
						if (diaryFile === null) {
							this.app.vault.createFolder(this.settings.folder);
							this.app.vault.create(filename, `${diaryMdArr.join('\n')}`);
						} else {
							let frontMatter = '';
							this.app.fileManager.processFrontMatter(diaryFile, (data) => {
								if (Object.keys(data).length) frontMatter = objToFrontmatter(data);
							});
							this.app.vault.process(diaryFile, (data) => {
								let diaryContentsArr = data.split('\n');
								if (frontMatter.length) {
									let count = 0;
									while (diaryContentsArr.length > 0) {
										let firstElement = diaryContentsArr.shift();
										if (firstElement === '---') {
											count++;
											if (count === 2) break;
										}
									}
								}
								const diaryContentsSet = new Set(diaryContentsArr);
								const newEntries = diaryMdArr.filter((entry: string) => !diaryContentsSet.has(entry));
								const finalEntries = this.settings.sort === 'Old'
									? [...diaryContentsArr, ...newEntries]
									: [...newEntries, ...diaryContentsArr];
								return frontMatter.length ? frontMatter + finalEntries.join('\n') : finalEntries.join('\n');
							})
						}
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
		const { containerEl } = this;
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

		new Setting(containerEl)
			.setName('Folder Path')
			.setDesc('Leave blank to use the default folder.')
			.addText((component) => {
				component.setPlaceholder('')
				component.setValue(this.plugin.settings.folder)
				component.onChange(async (value) => {
					this.plugin.settings.folder = value
					await this.plugin.saveSettings()
				})
			})
		new Setting(containerEl)
			.setName('File Name')
			.setDesc('Name the file to save your diary to.')
			.addText((component) => {
				component.setPlaceholder('Letterboxd Diary')
				component.setValue(this.plugin.settings.fileName)
				component.onChange(async (value) => {
					this.plugin.settings.fileName = value
					await this.plugin.saveSettings()
				})
			})
		new Setting(containerEl)
			.setName('Sort by Date')
			.setDesc('How your diary will be sorted.')
			.addDropdown((component) => {
				component.addOption('Old', 'Oldest First');
				component.addOption('Newest First', 'Newest First');
				component.setValue(this.plugin.settings.sort)
				component.onChange(async (value) => {
					this.plugin.settings.sort = value
					await this.plugin.saveSettings()
				})
			})
	}
}
