/**
 * Joins
 * 
 * @type {Array}
 */
module.exports = [
	{
		alias: 'to',				// the `alias` -- e.g. name of association

		where: {/* ... */},			// join subcriteria
		select: [ /* ... */ ],
		limit: undefined,
		skip: undefined,
		joins: [/* ... */],

		parent: 'user',				// left table name
		parentKey: 'id',			// left table primary key
		child: 'message_to_user',	// right table name
		childKey: 'user_id'			// right table foreign key
	},
	{
		alias: 'to',				// the `alias` -- e.g. name of association

		where: {/* ... */},			// join subcriteria
		select: [ /* ... */ ],
		limit: undefined,
		skip: undefined,
		joins: [/* ... */],

		parent: 'message_to_user',	// left table name
		parentKey: 'message_id',	// left table foreign key
		child: 'message',			// right table name
		childKey: 'id'				// right table primary key
	}
];