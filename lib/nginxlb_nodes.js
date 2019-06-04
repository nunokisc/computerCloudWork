var containers = require('./containers.js');
var NginxConfFile = require('nginx-conf').NginxConfFile;
const fs = require('fs')
var onlineNginxLbNodeContainers = [];
var timeOutDel = [];
module.exports = {
	createNewNginxLbNode: function(absolutePath,callback) 
	{
		
	},
	deleteNewNginxLbNode: function(absolutePath,nodeName,callback)
	{
		
	},
	deleteNewNginxLbNodeWithTimeout: function(absolutePath,callback)
	{
		module.exports.getNonTimeOutDel(function(nginxLbNode)
		{
			timeOutDel.push(
				{
					name:nginxLbNode.name,
					timeout:setTimeout(()=>{
						module.exports.deleteNewNginxLbNode(absolutePath,nginxLbNode.name,function(containerName)
						{
							timeOutDel = arrayRemove(timeOutDel,search(containerName,timeOutDel));
							callback(containerName+" eliminado");
						})
					},30000)
				}
			)
		})
		
	},
	getOnlineNginxLbNodeContainers: function(callback)
	{
		return callback(onlineNginxLbNodeContainers);
	},
	setOnlineNginxLbNodeContainers: function(nginxLbContainer)
	{
		onlineNginxLbNodeContainers.push(nginxLbContainer);
	},
	clearTimeOutDel: function()
	{
		clearTimeout(timeOutDel[timeOutDel.length-1].timeout);
		timeOutDel.splice(timeOutDel.length-1,1);
	},
	getTimeOutDel: function(callback)
	{
		return callback(timeOutDel);
	},
	getNonTimeOutDel: function(callback)
	{
		let nginxNode = {};
		if(timeOutDel.length > 0)
		{
			let exists = 0;
			console.log("entrou no timeOutDel.length > 0");
			for (let i = 0; i < onlineNginxLbNodeContainers.length; i++) 
			{
				exists = 0;
				for (let l = 0; l < timeOutDel.length; l++) 
				{
					if(timeOutDel[l].name == onlineNginxLbNodeContainers[i].name)
					{
						exists = 1;
					}	
				}
				if(exists == 0)
				{
					nginxNode = onlineNginxLbNodeContainers[i];
					console.log(nginxNode);
					break;
				}
			}
		}
		else
		{
			console.log("não entrou no timeOutDel.length > 0");
			nginxNode = onlineNginxLbNodeContainers[0];
			console.log(nginxNode);
		}
		return callback(nginxNode);
	}
};
// remove some key/value from array
function arrayRemove(arr, value) 
{
   return arr.filter(function(ele)
   {
       return ele != value;
   });

}
// function to search namekey in some array
function search(nameKey, myArray)
{
    for (var i=0; i < myArray.length; i++) 
    {
        if (myArray[i].name === nameKey) 
        {
            return myArray[i];
        }
    }
}
