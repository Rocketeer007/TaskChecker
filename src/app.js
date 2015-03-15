/**
 * Welcome to Pebble.js!
 *
 * This is where you write your app.
 */

var UI = require('ui');
var RememberTheMilk = require('rtm');
var Settings = require('settings');
var Vector2 = require('vector2');

// Remember the Milk API Key
var rtmApiKey = 'eaef795f24c6d8fa15416b415e52a132';
var rtmSecret = '30d5b37e19add5a1';
var rtm = new RememberTheMilk(rtmApiKey, rtmSecret, 'write');

// RTM Authentication Frob - may not be set yet
var rtmFrob = Settings.data('rtmFrob');
// RTM Authentication Token - may not be set yet
var rtmToken = Settings.data('rtmToken');

// Show splash screen while authentication with RTM
showStatusMessage("Authenticating with Remember the Milk");

// If we already have a Token - check it is valid
if (rtmToken && rtmToken !== undefined && rtmToken !== null) {
	checkAuthenticationToken(rtmToken);
} else if (rtmFrob && rtmFrob !== undefined && rtmFrob !== null) {
	// Otherwise, if we have a Frob, continue the Authentication process
	getAuthenticationToken(rtmFrob);
} else {
	// Otherwise, start the authentication from scratch 
	getAuthenticationFrob();
}

// Windows for global management
var splashWindow;
var listMenu;
var taskMenu;

// Available Lists
var rtmLists;
var rtmTasks;

/**
 *
 */
function showStatusMessage(statusMessage, action) {
	if (splashWindow !== null && splashWindow !== undefined) splashWindow.hide();
	splashWindow = new UI.Window();
	
	// Text element to inform user
	var text = new UI.Text({
		'position': new Vector2(0, 0),
		'size': new Vector2(144, 168),
		'text':statusMessage,
		'font':'GOTHIC_28_BOLD',
		'color':'black',
		'textOverflow':'wrap',
		'textAlign':'center',
		'backgroundColor':'white'
	});
	
	// Action Handler
	if (action !== null) splashWindow.on('click', 'select', action);
	
	// Add to splashWindow and show
	splashWindow.add(text);
	splashWindow.show();
}

/**
 *
 */
function getAuthenticationFrob() {
	// Get the Remember the Milk authentication Frob
	console.log('Getting a new Frob');
	rtm.get('rtm.auth.getFrob', function(resp) {
		console.log('Got Frob data: '+JSON.stringify(resp));
		var frob = resp.rsp.frob;
		// Save the Frob for later
		Settings.data('rtmFrob', frob);
		
		getAuthenticationToken(Settings.data('rtmFrob'));
	});
}

/**
 *
 */
function getAuthenticationToken(rtmFrob) {
	console.log('Getting Auth Token with Frob: '+rtmFrob);
	// Get an authentication Token
	rtm.get('rtm.auth.getToken', {'frob': rtmFrob}, function(resp){
		if (!resp.rsp.auth) {
			console.log('Auth token not found. Did you authenticate?\n');
			console.log('Response: '+JSON.stringify(resp));
			
			var authURL = rtm.getAuthUrl(rtmFrob);
			console.log('Please visit the following URL in your browser to authenticate:\n');
			console.log(authURL, '\n');
			
			showStatusMessage('Please open Settings to Authorise with RTM', getAuthenticationToken(rtmFrob));
			
			Settings.config({'url':authURL, 'autoSave':false}, null, null /**/);
		} else {
			// Save the Token & clear the Frob
			Settings.data('rtmToken', resp.rsp.auth.token);
			Settings.data('rtmFrob', null);
			
			/* Save the token to the RTM object */
			rtm.auth_token = resp.rsp.auth.token;
		
			getAvailableLists();
		}
	});
}

/**
 * 
 */
function checkAuthenticationToken(rtmToken) {
	console.log('Checking token validity: '+rtmToken);
	// Check the Token
	rtm.get('rtm.auth.checkToken', {'auth_token':rtmToken}, function(resp) {
		// Token is not valid
		if (!resp.rsp.stat || resp.rsp.stat != 'ok' || !resp.rsp.auth) {
			console.log('Token invalid: '+JSON.stringify(resp));
			// Clear the saved token
			Settings.data('rtmToken');
			// Restart authentication from scratch
			getAuthenticationFrob();
			return;
		}
		// Token is okay
		console.log('Token verified: '+JSON.stringify(resp));
		
		/* Save the token to the RTM object */
		rtm.auth_token = resp.rsp.auth.token;
		
		getAvailableLists();
	});
}

/** 
 * 
 */
function getAvailableLists() {
	rtm.get('rtm.lists.getList', function(resp){
		var i, list;
		var menuItems = [];
		// Clear the existing lists (if any)
		rtmLists = [];
		console.log('Found lists: '+JSON.stringify(resp));
		for (i = 0; i < resp.rsp.lists.list.length; i++) {
			list = resp.rsp.lists.list[i];
			rtmLists.push(list);
			console.log('List '+i+': '+JSON.stringify(list));
			menuItems.push({'title':list.name});
		}
		showListsMenu(menuItems);
	});
}

/**
 *
 */
function showListsMenu(menuItems) {
	// Construct Menu to show to user
	listMenu = new UI.Menu({
		sections: [{
			title: 'Available Lists',
			items: menuItems
		}]
	});
	listMenu.on('select', getActiveTasks);
	// Show the Menu, hide the splash
	listMenu.show();
	if (splashWindow !== null && splashWindow !== undefined) splashWindow.hide();
}

/**
 * 
 */
function getActiveTasks(menuEvent) {
	// Identify the menu item that has been selected
	console.log('Menu Event: '+menuEvent.item.title+'/'+menuEvent.itemIndex);
	console.log('List Name: '+rtmLists[menuEvent.itemIndex].name+'/'+rtmLists[menuEvent.itemIndex].id);
	// Get the List ID
	var rtmListId = rtmLists[menuEvent.itemIndex].id;
	rtm.get('rtm.tasks.getList', {'list_id': rtmListId, 'filter': 'status:incomplete'}, function(resp){
		console.log('Found items: '+JSON.stringify(resp));
		rtmTasks = [];
		var menuTasks = [];
		if (!resp.rsp.tasks.list) {
			showStatusMessage('No Active Tasks On This List');
		} else {
			for (var i = 0; i < resp.rsp.tasks.list.length; i++) {
				for (var j = 0; j < resp.rsp.tasks.list[i].taskseries.length; j++) {
					var task = resp.rsp.tasks.list[i].taskseries[j];
					console.log('Task '+j+': '+JSON.stringify(task));
					rtmTasks.push(task);
					menuTasks.push({'title':task.name});
				}
			}
			showTasksMenu(menuTasks);
		}
	});
}

/**
 *
 */
function showTasksMenu(menuItems) {
	// Construct Menu to show to user
	taskMenu = new UI.Menu({
		sections: [{
			title: 'Active Tasks',
			items: menuItems
		}]
	});
	// Show the Menu, hide the splash (if present)
	taskMenu.show();
	if (splashWindow !== null && splashWindow !== undefined) splashWindow.hide();
}
