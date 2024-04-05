# Letterboxd for Obsidian

This project syncs your Letterboxd diary to a file in Obsidian with date-specific backlinks. This can help you keep track of movies you've seen as well as when you've seen them.

As Letterboxd's API is restrictive, this uses the [public RSS feeds](https://letterboxd.com/fleker/rss/) to get the data. As such, this only can pull the last 50 movies at a time. However, once this plugin is setup, it will continue merging diary entries going forward.

## Example

You open up the command palette and run the **Sync Letterboxd Diary** command. It then fetches data and places it in a file called `Letterboxd Diary.md` in a bulleted list.

```md
- Gave [4 stars to Ahsoka](https://letterboxd.com/fleker/film/ahsoka/) on [[2024-04-04]]
- Gave [4 stars to The Rising of the Moon](https://letterboxd.com/fleker/film/the-rising-of-the-moon/) on [[2024-03-30]]
- Gave [2 stars to Secret Invasion](https://letterboxd.com/fleker/film/secret-invasion/) on [[2024-03-21]]
- Gave [5 stars to Scavengers Reign](https://letterboxd.com/fleker/film/scavengers-reign/) on [[2024-03-20]]
- Gave [3 stars to Lessons in Chemistry](https://letterboxd.com/fleker/film/lessons-in-chemistry/) on [[2024-03-19]]
```

This plugin could use your feedback and help to make it a success!