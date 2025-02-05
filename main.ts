import { App, Plugin, PluginSettingTab, Setting, requestUrl, FuzzySuggestModal, TAbstractFile, TFile, TextComponent, normalizePath, moment } from 'obsidian';
import { XMLParser } from 'fast-xml-parser';
import {
	getDailyNoteSettings
} from "obsidian-daily-notes-interface";


interface LetterboxdSettings {
	username: string;
	dateFormat: string;
	path: string;
	sort: string;
	callout: 'List' | 'ListReview' | 'Callout' | 'CalloutPoster';
	stars: number;
	addReferenceId: boolean;
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

// FileSelect is a subclass of FuzzySuggestModal that is used to select a file from the vault
class FileSelect extends FuzzySuggestModal<TAbstractFile | string> {
	files: TFile[];
	plugin: LetterboxdPlugin;
	values: string[];
	textBox: TextComponent;
	constructor(app: App, plugin: LetterboxdPlugin, textbox: TextComponent) {
		super(app);
		this.files = this.app.vault.getMarkdownFiles();
		this.plugin = plugin;
		// The HTML element for the textbox needs to be passed in to the constructor to update
		this.textBox = textbox;
		this.setPlaceholder('Select or create a file');

		// Logging TAB keypresses to add folder paths to the selection incrementally
		this.scope.register([], 'Tab', e => {
			let child = this.resultContainerEl.querySelector('.suggestion-item.is-selected');
			let text = child ? child.textContent ? child.textContent.split('/') : [] : [];
			let currentInput = this.inputEl.value.split('/');
			let toSlice = text[0] === currentInput[0] ? currentInput.length : 1;
			if (currentInput.length && text[currentInput.length - 1] === currentInput[currentInput.length - 1]) toSlice++;
			this.inputEl.value = text.slice(0, toSlice).join('/');
		});

		// Logging ENTER keypresses to submit the value if there are no selected items
		// ENTER and TAB can only be handelled by different listeners, annoyingly
		this.containerEl.addEventListener('keyup', e => {
			if (e.key !== 'Enter') return;
			if (!this.resultContainerEl.querySelector('.suggestion-item.is-selected') || e.getModifierState('Shift')) {
				this.plugin.settings.path = this.inputEl.value
				this.plugin.saveSettings();
				this.textBox.setValue(this.plugin.settings.path);
				this.close();
			}
		})
	}

	// These functions are built into FuzzySuggestModal
	getItems() {
		return this.files.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent) {
		this.plugin.settings.path = item.path;
		this.plugin.saveSettings();
		this.textBox.setValue(this.plugin.settings.path);
	}
}

const DEFAULT_SETTINGS: LetterboxdSettings = {
	username: '',
	dateFormat: getDailyNoteSettings().format ?? '',
	path: 'Letterboxd Diary',
	sort: 'Old',
	callout: 'List',
	stars: 0,
	addReferenceId: false,
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
			yamlString += `${key}:\n`;
			obj[key].forEach((value: string) => yamlString += `  - ${value}\n`);
		} else {
			yamlString += `${key}: ${obj[key]}\n`;
		}
	}
	return yamlString += '---\n';
}

function starParser(rating: number | undefined, star: number): string {
	if (rating === undefined) return '';
	switch (star) {
		case 0:
		default:
			return `(${rating} stars)`;
		case 1:
			return `(${'★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '')})`;
		case 2:
			return `(${'⭐'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '')})`;
	}
}

function printOut(settings: LetterboxdSettings, item: RSSEntry) {
	let description = document.createElement('div');
	description.innerHTML = item.description;
	const imgElement = description.querySelector('img');
	let img = imgElement ? imgElement.src : null;
	let reviewText: string | null = Array.from(description.querySelectorAll('p'))
		.map(p => p.textContent)
		.filter(text => text && text.trim() !== "")
		.join('\r > \r > ');
	if (reviewText.contains('Watched on')) reviewText = null;
	const filmTitle = decodeHtmlEntities(item['letterboxd:filmTitle']);
	const watchedDate = settings.dateFormat
		? moment(item['letterboxd:watchedDate']).format(settings.dateFormat)
		: item['letterboxd:watchedDate'];
	let stars = starParser(item['letterboxd:memberRating'], settings.stars);
	const reference = (() => {
		if (settings.addReferenceId) {
			return ` ^letterboxd${item.guid.split('-')[2]}`
		}
		return ''
	})()
	switch (settings.callout) {
		case 'List':
			return `- ${stars?.length ? `Reviewed [${filmTitle}](${item['link']}) ` + stars : `Watched [${filmTitle}](${item['link']})`} on [[${watchedDate}]]`;
		case 'ListReview':
			return `- ${reviewText ? `Reviewed ` : `Watched `} [${filmTitle}](${item['link']}) ${stars} on [[${watchedDate}]] ${reviewText ? `\r >${reviewText}\n` : ''}`;
		case 'Callout':
			return `> [!letterboxd]+ ${item['letterboxd:memberRating'] !== undefined || reviewText ? 'Review: ' : 'Watched: '} [${filmTitle}](${item['link']}) ${stars} - [[${watchedDate}]] \r> ${reviewText ? reviewText : ''}${reference}\n`;
		case 'CalloutPoster':
			return `> [!letterboxd]+ ${item['letterboxd:memberRating'] !== undefined || reviewText ? 'Review: ' : 'Watched: '} [${filmTitle}](${item['link']}) ${stars} - [[${watchedDate}]] \r> ${reviewText ? img ? `![${filmTitle}|200](${img}) \r> ${reviewText}` : reviewText : ''}${reference}\n`;
	}
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
						const filename = normalizePath(this.settings.path.endsWith('.md') ? this.settings.path : this.settings.path + '.md');
						const diaryMdArr = (jObj.rss.channel.item as RSSEntry[])
							.sort((a, b) => {
								const dateA = new Date(a.pubDate).getTime();
								const dateB = new Date(b.pubDate).getTime();
								return this.settings.sort === 'Old' ? dateA - dateB : dateB - dateA;
							})
							.map((item: RSSEntry) => {
								return printOut(this.settings, item);
							})
						const diaryFile = this.app.vault.getFileByPath(filename)
						if (diaryFile === null) {
							let pathArray = this.settings.path.split('/');
							pathArray.pop();
							if (pathArray.length > 1) this.app.vault.createFolder(pathArray.join('/'));
							this.app.vault.create(filename, `${diaryMdArr.join('\n')}`);
						} else {
							let frontMatter = '';
							this.app.fileManager.processFrontMatter(diaryFile, (data) => {
								if (Object.keys(data).length) frontMatter = objToFrontmatter(data);
							});
							this.app.vault.process(diaryFile, (data) => {
								let diaryContentsArr = data.split('\n');
								// If there is frontmatter, this works out how many lines to ignore.
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

		let fileSelectorText: TextComponent;
		new Setting(containerEl)
			.setName('Set Note')
			.setDesc('Select the file to save your Letterboxd to. If it does not exist, it will be created.')
			.addText((component) => {
				component.setPlaceholder('')
				component.setValue(this.plugin.settings.path)
				component.onChange(async (value) => {
					this.plugin.settings.path = value
					await this.plugin.saveSettings();
				});
				fileSelectorText = component;
			})
			.addButton((component) => {
				component.setButtonText('Select Note');
				component.onClick(async () => {
					new FileSelect(this.app, this.plugin, fileSelectorText).open();
				})
			});

		new Setting(containerEl)
			.setName('Sort by Date')
			.setDesc('Select the order to list your diary entries.')
			.addDropdown((component) => {
				component.addOption('Old', 'Oldest First');
				component.addOption('New', 'Newest First');
				component.setValue(this.plugin.settings.sort)
				component.onChange(async (value) => {
					this.plugin.settings.sort = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(containerEl)
			.setName('Display Style')
			.setDesc('Select how to list your reviews. Options cover plain text lists, callouts, or callouts with poster images.')
			.addDropdown((component) => {
				component.addOption('List', 'List Only');
				component.addOption('ListReview', 'List & Reviews');
				component.addOption('Callout', 'Callout');
				component.addOption('CalloutPoster', 'Callout w/ Poster')
				component.setValue(this.plugin.settings.callout.toString());
				component.onChange(async (value: LetterboxdSettings['callout']) => {
					this.plugin.settings.callout = value;
					await this.plugin.saveSettings()
				})
			})
		new Setting(containerEl)
			.setName('Stars')
			.setDesc('Select how you would like stars to be represented.')
			.addDropdown((component) => {
				component.addOption('0', '5 Stars');
				component.addOption('1', '★★★★★');
				component.addOption('2', '⭐⭐⭐⭐⭐')
				component.setValue(this.plugin.settings.stars.toString());
				component.onChange(async (value) => {
					this.plugin.settings.stars = parseInt(value)
					await this.plugin.saveSettings()
				})
			})
		new Setting(containerEl)
			.setName('Add Reference ID')
			.setDesc('Only applies to callouts.')
			.addToggle((component) => {
				component.setValue(this.plugin.settings.addReferenceId)
				component.onChange(async (value) => {
					this.plugin.settings.addReferenceId = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(containerEl)
			.setName('Date Format')
			.setDesc('Enter the Moment.js date format to display watched dates (e.g., YYYY-MM-DD)')
			.addText((component) => {
				component.setPlaceholder('YYYY-MM-DD');
				component.setValue(this.plugin.settings.dateFormat);
				component.onChange(async (value) => {
					this.plugin.settings.dateFormat = value;
					await this.plugin.saveSettings();
				});
			});
		
	}
}