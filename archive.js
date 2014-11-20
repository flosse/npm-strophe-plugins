(function(){
  if (!Date.prototype.setISO6801) {
    // from http://stackoverflow.com/questions/5249216/javascript-timestamp-from-iso8061
    Date.prototype.setISO8601 = function(dString){
      var regexp = /(\d\d\d\d)(-)?(\d\d)(-)?(\d\d)(T)?(\d\d)(:)?(\d\d)(:)?(\d\d)(\.\d+)?(Z|([+-])(\d\d)(:)?(\d\d))/;
      if (dString.toString().match(new RegExp(regexp))) {
        var d = dString.match(new RegExp(regexp));
        var offset = 0;
        this.setUTCDate(1);
        this.setUTCFullYear(parseInt(d[1],10));
        this.setUTCMonth(parseInt(d[3],10) - 1);
        this.setUTCDate(parseInt(d[5],10));
        this.setUTCHours(parseInt(d[7],10));
        this.setUTCMinutes(parseInt(d[9],10));
        this.setUTCSeconds(parseInt(d[11],10));
        if (d[12]) {
          this.setUTCMilliseconds(parseFloat(d[12]) * 1000);
        }
        else {
          this.setUTCMilliseconds(0);
        }
        if (d[13] != 'Z') {
          offset = (d[15] * 60) + parseInt(d[17],10);
          offset *= ((d[14] == '-') ? -1 : 1);
          this.setTime(this.getTime() - offset * 60 * 1000);
        }
      }
      else {
        this.setTime(Date.parse(dString));
      }
      return this;
    }
  }
}).call(this)
// http://xmpp.org/extensions/xep-0136.html
Strophe.addConnectionPlugin('archive', {
  _connection: null,

  init: function(connection) {
    this._connection = connection;
    Strophe.addNamespace('DELAY', 'jabber:x:delay');
    Strophe.addNamespace('ARCHIVE', 'urn:xmpp:archive');
  },

  listCollections: function(jid, rsm, callback) {
    var xml = $iq({type: 'get', id: this._connection.getUniqueId('list')}).c('list', {xmlns: Strophe.NS.ARCHIVE, 'with': jid});
    if (rsm) { xml = xml.cnode(rsm.toXML()); }
    this._connection.sendIQ(xml, this._handleListConnectionResponse.bind(this, callback));
  },
  
  _handleListConnectionResponse: function(callback, stanza) {
    var collections = [];
    var chats = stanza.getElementsByTagName('chat');
    for (var ii = 0; ii < chats.length; ii++) {
      var jid = chats[ii].getAttribute('with');
      var start = chats[ii].getAttribute('start');
      collections.push(new Strophe.ArchivedCollection(this._connection, jid, start));
    }
    var responseRsm = new Strophe.RSM({xml: stanza.getElementsByTagName('set')[0]});
    callback(collections, responseRsm);
  },

  getAutoArchiving: function(callback) {
    var xml = $iq({type: 'get', id: this._connection.getUniqueId('pref')}).c('pref', {xmlns: Strophe.NS.ARCHIVE});
    this._connection.sendIQ(xml, this._handleGetPreferencesResponse.bind(this, callback));
  },
  
  _handleGetPreferencesResponse: function(callback, stanza) {
    var auto = false;
	Strophe.forEachChild(stanza.children[0], 'auto', function(child) {
        auto = child.attributes.save.value == "true";
	});
	callback(auto);
  },

  setAutoArchiving: function(save, success, error, timeout) {
    var xml = $iq({type: 'set', id: this._connection.getUniqueId('auto')}).c('auto', {xmlns: Strophe.NS.ARCHIVE, save: save});
    this._connection.sendIQ(xml, success, error, timeout);
  }
});

Strophe.ArchivedCollection = function(connection, jid, start) {
  this.connection = connection;
  this.jid = jid;
  this.start = start;
  this.startDate = (new Date()).setISO8601(start);
};

Strophe.ArchivedCollection.prototype = {
  retrieveMessages: function(rsm, callback) {
    var builder = $iq({type: 'get', id: this.connection.getUniqueId('retrieve')}).c('retrieve', {xmlns: Strophe.NS.ARCHIVE, 'with': this.jid, start: this.start});
    if (rsm) { builder = builder.cnode(rsm.toXML()); }
    this.connection.sendIQ(builder, function(stanza) {
      var messages = [];
      var myJid = Strophe.getBareJidFromJid(this.connection.jid);
      var responseRsm;
      var timestamp = this.startDate;
      var msgTimestamp;
      var chat = stanza.getElementsByTagName('chat')[0];
      var element = chat.firstChild;
      while (element) {
        switch (element.tagName) {
        case 'to':
          msgTimestamp = this._incrementTimestampForMessage(timestamp, element);
          messages.push(new Strophe.ArchivedMessage(msgTimestamp, myJid, this.jid, Strophe.getText(element.getElementsByTagName('body')[0])));
          break;
        case 'from':
          msgTimestamp = this._incrementTimestampForMessage(timestamp, element);
          messages.push(new Strophe.ArchivedMessage(msgTimestamp, this.jid, myJid, Strophe.getText(element.getElementsByTagName('body')[0])));
          break;
        case 'set':
          responseRsm = new Strophe.RSM({xml: element});
          break;
        default:
          break;
        }
        element = element.nextSibling;
      }
      callback(messages, responseRsm);
    }.bind(this));
  },

  _incrementTimestampForMessage: function(timestamp, element) {
    var secs = element.getAttribute('secs');
    var newTimestamp = new Date();
    newTimestamp.setTime(timestamp.getTime() + Number(secs) * 1000);
    return newTimestamp;
  }
};

Strophe.ArchivedMessage = function(timestamp, from, to, body) {
  this.timestamp = timestamp;
  this.from = from;
  this.to = to;
  this.body = body;
};

Strophe.ArchivedMessage.prototype = {
};

