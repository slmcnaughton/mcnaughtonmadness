# McNaughton Madness
A competetive March Madness bracket-game using round-by-round picks, incentivizing upsets and rewarding accuracy, every matchup in the NCAA tournament matchup. Originally created in the early 1990s, McNaughton Madness has grown to include over 30 extended family members and additional groups for friends. The app preserves the integrity of the original design by allowing for individual bracket picks, comments, smack talk, and scoring while providing automatic and instantaneous score updates.


## Scoring
If team A represents the higher seed (ex. a 5 seed) and team B represents the lower seed (ex. 12):
* If team A is selected and wins: Receive the fraction A/B points
* If team A is selected and loses: Lose the fraction A/B points
* If team B is selected and wins: Receive the fraction B/A points
* If team B is selected and loses: Lose 1 point
* Each of these results are then multiplied by the round (ex. round 3 triples the values of each game's gains/losses.)

### Scoring Example 1: A 5 vs 12 matchup in Round 1
|Seed Picked|5|5|12|12|
|------------------|:---:|:----:|:---:|:---:|
|Winning Seed|5|12|12|5|
|Points Earned|5/12|-5/12|12/5|-1|
|Round Multiplier|1|1|1|1|
|Total Match Points|0.417|-0.417|2.4|-1|

### Scoring Example 2: A 2 vs 3 matchup in Round 3
|Seed Picked|2|2|3|3|
|------------------|:---:|:----:|:---:|:---:|
|Winning Seed|2|3|3|2|
|Points Earned|2/3|-2/3|3/2|-1|
|Round Multiplier|3|3|3|3|
|Total Match Points|2|-2|4.5|-3|

## Features

This project was developed and released for the start of the 2018 NCAA tournament. Still in progress, but functional and sufficient for the McNaughton Family Group pool.

### Current Features
Features are divided into website features, user features, tournament features, or tournament group features 

#### Website Features

#### User Features
* User authorization (using Passport.js) and password recovery (emailed using SendGrid)
* Trophies representing prior player performance
* Password recovery (password emailed using SendGrid)

#### Tournament Features
* Ability to create annual March Madness tournament (64 teams, 6 rounds w/starting times)
* Tournament is automatically updated live (web scraper updates database from finalized matches on CBS's NCAA scoreboard)
* Visual bracket (team images scraped from CBS's database and stored)

#### Tournament Group Features
* Users can create public/private tournament groups to invite friends
* Users can post to the Tournament Group comment board
* All user-picks are aggregated and displayed so you can see who picked which matchup
* Sortable standings
* Individual user tournaments


### Future Features
Just a few features I would like to include for the future!
#### Website Features
* Add "Is-Admin" option and "Is-Commissioner" options to allow for easier/safer maintenance

#### User Features
* Update user profile page (allow user to update settings, add profile images)

#### Tournament Features
* Select from database of teams (to avoid typos)
* USe 68 teams (and let web-scraper move the appropriate teams along in the preliminary rounds)

#### Tournament Group Features
* Hover-popup: a) Make wider to show team/user picks side-by-side b) In large groups, show %'s and only show the top X players for each selection
* Automatically email round summary to all participants and remind users to submit next round of picks
* Message board: shorten amount neeeded to scroll through, add notifications bubble to Tournament Group page so players know that new posts have been created
* Narrow down final four/champion user choices to the teams the player has remaining at that point (ex. picking a champion from the final four picks)

#### Bug Fixes
- Occasionally people end up with a duplicated round. I hypothesize this is because of double clicking on the submit button (or perhaps it glitches/fails in some way, causing them to think they need to submit a second time), however I haven't seen the issue on my end. Either way, it'd be nice to prevent a round from being duplicated.

## Built With
* HTML
* CSS
* Bootstrap
* JavaScript
* jQuery
* EJS
* Node.js
* Express
* Mongoose
* MongoDB (through mLab)
* Deployed to Heroku

## Author
**Seth McNaughton**


## Acknowledgments
* [Web Developer Bootcamp (Udemy)](https://www.udemy.com/the-web-developer-bootcamp/learn/v4/overview) - Developer Content Knowledge
* [BracketClub](https://github.com/bracketclub/bracket.club) - Bracket Framework CSS
* [Nicolas Hoening](https://www.nicolashoening.de/?twocents&nr=8) - Hover-over Popups
* [DataTables.net](https://datatables.net/) - Sortable, jQuery data tables
