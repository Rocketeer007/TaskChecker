/**
 * Welcome to Pebble.js!
 *
 * This is where you write your app.
 */

var UI = require('ui');
var RememberTheMilk = require('rtm');
var Settings = require('settings');
var Vector2 = require('vector2');
var moment = require('moment.min');

// Remember the Milk API Key
var rtmApiKey = 'eaef795f24c6d8fa15416b415e52a132';
var rtmSecret = '30d5b37e19add5a1';
var rtm = new RememberTheMilk(rtmApiKey, rtmSecret, 'write');

// RTM Authentication Frob - may not be set yet
var rtmFrob = Settings.data('rtmFrob');
// RTM Authentication Token - may not be set yet
var rtmToken = Settings.data('rtmToken');

// Windows for global management
var splashWindow;
var listMenu;
var taskMenu;

// Show splash screen while authentication with RTM
showStatusMessage("Authenticating with Remember the Milk");

// Configure the Locale
moment.locale('en-gb');

// If we already have a Token - check it is valid
if (rtmToken && rtmToken !== undefined && rtmToken !== null) {
	checkAuthenticationToken();
} else if (rtmFrob && rtmFrob !== undefined && rtmFrob !== null) {
	// Otherwise, if we have a Frob, continue the Authentication process
	getAuthenticationToken();
} else {
	// Otherwise, start the authentication from scratch 
	getAuthenticationFrob();
}

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
	if (action instanceof Function) splashWindow.on('click', 'select', action);
	
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
		
		getAuthenticationToken();
	});
}

/**
 *
 */
function getAuthenticationToken() {
	rtmFrob = Settings.data('rtmFrob');
	console.log('Getting Auth Token with Frob: '+rtmFrob);
	// Get an authentication Token
	rtm.get('rtm.auth.getToken', {'frob': rtmFrob}, function(resp){
		if (!resp.rsp.auth) {
			console.log('Auth token not found. Did you authenticate?\n');
			console.log('Response: '+JSON.stringify(resp));
			
			var authURL = rtm.getAuthUrl(rtmFrob);
			console.log('Please visit the following URL in your browser to authenticate:\n');
			console.log(authURL, '\n');
			
			showStatusMessage('Please open Settings to Authorise with RTM', getAuthenticationToken);
			
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
function checkAuthenticationToken() {
	rtmToken = Settings.data('rtmToken');
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
		console.log('Found lists: '+JSON.stringify(resp));
		for (i = 0; i < resp.rsp.lists.list.length; i++) {
			list = resp.rsp.lists.list[i];
			console.log('List '+i+': '+JSON.stringify(list));
			menuItems.push({'title':list.name, 'rtmListId':list.id});
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
			title: 'Daily Lists',
			items: [{'title':'Today','rtmListId':-1,'rtmListFilter':'dueBefore:tomorrow'}]
		},{
			title: 'User Lists',
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
function getActiveTasks(menuEvent, evtName, evtValue) {
	// Identify the menu item that has been selected
	console.log('Menu Event: '+menuEvent.item.title+'/'+menuEvent.itemIndex+'/'+menuEvent.item.rtmListId);
	var rtmListTitle = menuEvent.item.title;
	var rtmListId    = menuEvent.item.rtmListId;
	var rtmFilterText = 'status:incomplete';
	// Add any filter text from the Menu
	if (menuEvent.item.rtmListId == -1 && menuEvent.item.rtmListFilter)
		rtmFilterText = rtmFilterText + ' AND ('+menuEvent.item.rtmListFilter+')';
	getFilteredTasks(rtmListTitle, rtmListId, rtmFilterText);
}

/**
 * 
 */
function getFilteredTasks(rtmListTitle, rtmListId, rtmFilterText) {
	var rtmParams;
	if (rtmListId == -1) rtmParams = {'filter':rtmFilterText};
	else rtmParams = {'list_id':rtmListId, 'filter':rtmFilterText};
	// Fetch all the tasks from the selected list with filter, and create a menu
	rtm.get('rtm.tasks.getList', rtmParams, function(resp){
		console.log('Found items: '+JSON.stringify(resp));
		var menuTasks = [];
		if (!resp.rsp.tasks.list) {
			showStatusMessage('No Active Tasks On This List');
		} else {
			console.log('Found '+resp.rsp.tasks.list.length+' lists!');
			// Loop through the Lists returned for this query
			for (var i = 0; i < resp.rsp.tasks.list.length; i++) {
				// Force the TaskSeries to be an array
				if (resp.rsp.tasks.list[i].taskseries.constructor !== Array) 
					resp.rsp.tasks.list[i].taskseries = [resp.rsp.tasks.list[i].taskseries];
				console.log('List '+i+' has '+resp.rsp.tasks.list[i].taskseries.length+'task(s)');
				// Loop through the TaskSeries entries on this List
				for (var j = 0; j < resp.rsp.tasks.list[i].taskseries.length; j++) {
					var rtmTaskSeries = resp.rsp.tasks.list[i].taskseries[j];
					console.log('List '+i+' / TaskSeries '+j+': '+JSON.stringify(rtmTaskSeries));
					// Force the Task to be an array
					if (rtmTaskSeries.task.constructor !== Array) 
						rtmTaskSeries.task = [rtmTaskSeries.task];
					// Loop through the Task entries on this TaskSeries
					for (var k = 0; k < rtmTaskSeries.task.length; k++) {
						var rtmTask = rtmTaskSeries.task[k];
						var subTitle = 'P'+rtmTask.priority+': ';
						var dueDate = moment(rtmTask.due).calendar();
						if (rtmTask.has_due_time == '0' && dueDate.indexOf(' at ') > 0) {
							dueDate = dueDate.substr(0, dueDate.indexOf(' at '));
						}
						subTitle += dueDate;
						menuTasks.push({'title':rtmTaskSeries.name,'subtitle':subTitle,'rtmListId':resp.rsp.tasks.list[i].id,'rtmTaskSeriesId':rtmTaskSeries.id,'rtmTaskId':rtmTask.id});
					}
				}
			}
			showTasksMenu(rtmListTitle, menuTasks);
		}
	});
}

/**
 *
 */
function showTasksMenu(listName, menuItems) {
	// Construct Menu to show to user
	taskMenu = new UI.Menu({
		sections: [{
			title: listName,
			items: menuItems
		}]
	});
	taskMenu.on('select', showTaskOptions);
	taskMenu.on('longSelect', completeTask);
	// Show the Menu, hide the splash (if present)
	taskMenu.show();
	if (splashWindow !== null && splashWindow !== undefined) splashWindow.hide();
}

/** 
 * menuEvent {
 *   menu - The Menu object
 *   section - The Menu Section object
 *   sectionIndex - The index of the Section of the selected item
 *   item - The Menu Item object
 *   itemIndex - The index of the selected item
 * }
 *
 * menuItem {
 *   title - the name of the Task
 *   subtitle - the priority & due date of the task
 *   rtmListId - the ID of the RTM List for this task
 *   rtmTaskSeriesId - the ID of the RTM Task Series for this task
 *   rtmTaskId - the ID of the RTM Task
 * }
 */
function showTaskOptions(menuEvent, evtName, evtValue) {
	// Construct a new menu with options
	var taskOptionMenu = new UI.Menu({
		sections: [{
			title: menuEvent.item.title,
			items: [{
				title:'Complete',
				rtmListId:menuEvent.item.rtmListId,
				rtmTaskSeriesId:menuEvent.item.rtmTaskSeriesId,
				rtmTaskId:menuEvent.item.rtmTaskId,
				rtmAction:'COMPLETE'
			},{
				title:'Postpone',
				rtmListId:menuEvent.item.rtmListId,
				rtmTaskSeriesId:menuEvent.item.rtmTaskSeriesId,
				rtmTaskId:menuEvent.item.rtmTaskId,
				rtmAction:'POSTPONE'
			}]
		}]
	});
	taskOptionMenu.on('select', handleTaskOption);
	taskOptionMenu.show();
	if (splashWindow !== null && splashWindow !== undefined) splashWindow.hide();
}

/**
 * 
 */
function handleTaskOption(menuEvent, evtName, evtValue) {
	switch (menuEvent.item.rtmAction) {
		case 'COMPLETE':
			getTimeline(menuEvent, evtName, evtValue, completeTask);
			break;
		case 'POSTPONE':
			getTimeline(menuEvent, evtName, evtValue, postponeTask);
			break;
	}
}

/**
 * 
 */
function getTimeline(menuEvent, evtName, evtValue, nextAction) {
	nextAction(menuEvent, evtName, evtValue, '<Unknown>');
}

/**
 * 
 */ 
function completeTask(menuEvent, evtName, evtValue, rtmTimeline) {
	if (rtmTimeline === undefined || rtmTimeline === null) {
		getTimeline(menuEvent, evtName, evtValue, completeTask);
	} else {
		showStatusMessage('Complete on TL '+rtmTimeline+': '+menuEvent.item.rtmListId+'/'+menuEvent.item.rtmTaskSeriesId+'/'+menuEvent.item.rtmTaskId);
	}
}

/**
 * 
 */
function postponeTask(menuEvent, evtName, evtValue, rtmTimeline) {
	if (rtmTimeline === undefined || rtmTimeline === null) {
		getTimeline(menuEvent, evtName, evtValue, postponeTask);
	} else {
		showStatusMessage('Postpone on TL '+rtmTimeline+': '+menuEvent.item.rtmListId+'/'+menuEvent.item.rtmTaskSeriesId+'/'+menuEvent.item.rtmTaskId);
	}
}

function testMenuOn(menuEvent, evtName, evtValue, option3, option4) {
	try {
		console.log('menuEvent: '+JSON.stringify(menuEvent));
	} catch (e) {
		console.log('menuEvent: '+typeof(menuEvent)+' = '+menuEvent);
	}
	console.log('evtName: '+typeof(evtName)+' = '+evtName);
	console.log('evtValue: '+typeof(evtValue)+' = '+evtValue);
	console.log('option3: '+typeof(option3)+' = '+option3);
	console.log('option4: '+typeof(option4)+' = '+option4);
}
