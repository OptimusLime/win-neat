//here we test the insert functions
//making sure the database is filled with objects of the schema type
var neat = require('neatjs');
var neatSchema = require('./neatSchema.js');
var NodeType = neat.NodeType;
var neatNode = neat.neatNode;
var neatConnection = neat.neatConnection;
var neatGenome = neat.neatGenome;

var wMath = require('win-utils').math;

module.exports = winneat;

function defaultParameters()
{
	//make a new neat param object
	var np = new neat.neatParameters();

    //set up the defaults here
    np.pMutateAddConnection = .13;
    np.pMutateAddNode = .13;
    np.pMutateDeleteSimpleNeuron = .00;
    np.pMutateDeleteConnection = .00;
    np.pMutateConnectionWeights = .72;
    np.pMutateChangeActivations = .02;

    np.pNodeMutateActivationRate = 0.2;
    np.connectionWeightRange = 3.0;
    np.disallowRecurrence = true;

    //send it back
    return np;
}

function selectXFromSmallObject(x, objects){

	//the final ix object will be returned
    var ixs = [];
    //works with objects with count or arrays with length
    var gCount = objects.count === undefined ? objects.length : objects.count;

    for(var i=0; i<gCount;i++)
        ixs.push(i);

    //how many do we need back? we need x back. So we must remove (# of objects - x) leaving ... x objects
    for(var i=0; i < gCount -x; i++)
    {
        //remove random index
        ixs.splice(wMath.next(ixs.length),1);
    }

    //return a random collection of distinct indices
    return ixs;
};


function winneat(backbone, globalConfig, localConfig)
{
	var self = this;

	//boom, let's get right into the business of encoding

	self.winFunction = "encoding";
	//maintain backwards compat with old win versions -- use neat geno name
	self.encodingName = "NEATGenotype";

	self.log = backbone.getLogger(self);
	//only vital stuff goes out for normal logs
	self.log.logLevel = localConfig.logLevel || self.log.normal;

	//either pass in your own, or we make some defaults
	self.neatParameters = localConfig.neatParameters || defaultParameters();

	//pull options from the local config object under options
	self.options = localConfig.options || {};


	self.eventCallbacks = function()
	{ 
		return {
			//easy to handle neat geno full offspring
			"encoding:NEATGenotype-createFullOffspring" : function(genProps, parentProps, sessionObject, done) { 
				
                //session might be undefined -- depending on win-gen behavior
                //make sure session exists
                sessionObject = sessionObject || {};

				//need to engage parent creation here -- could be complicated
				//taken from previous neatjs stuff -- added forced parents logic
				var jsonParents = parentProps.parents;

				//we have the json parents above, now we need to convert into fresh actual parents 
				var parents = [];
				for(var i=0; i < jsonParents.length; i++)
				{
					//convert genotype json into full genotype with functions and stuff
					var ng = genotypeFromJSON(jsonParents[i]);
					parents.push(ng);
				}

                //how many to make
				var count = genProps.count;

                //these will be the final objects to return
				var allParents = [];
				var children = [];

				//pull potential forced parents
				var forced = sessionObject.forceParents;

                //if we are forced to use particular parents, this helper will put the list of parents in an array for us
				var getForceParents = function(parentList)
				{
					var fullParents = [];
					for(var i=0; i < parentList.length; i++)
					{
						//grab the index
						var pIx = parentList[i];
						//use index to fetch full parent object -- push to parental list
						fullParents.push(parents[pIx]);
					}
					return fullParents;
				}

				//go through all the children -- using parents or force parents to create the new offspring
				// keep in mind all parents are full neatgenomes that have all necessary functions
				for(var c=0; c < count; c++)
				{
					//use the parents 
					var oParents = parents;

					//forced has a full parental list
					if(forced)
						oParents = getForceParents(forced[c]);

					//create offspring from the parents, hooray
                    //session object potentially has things for handling newConnection/newNodes logic
					var offObject = self.createNextGenome(oParents, sessionObject);

					//back to JSON from whence you came!
					var rOffspring = genotypeToJSON(offObject.offspring);

					//grab the json offspring object
					children.push(rOffspring);

					//createnext genome knows which parents were involved
					allParents.push(offObject.parentIxs);
				}

				//done, send er back
				done(undefined, children, allParents);

			 	return; 
			 }
		};
	};

	self.markParentConnections = function(parents, sessionObject){

        for(var s=0; s < parents.length; s++)
        {
            var parent = parents[s];
            for(var c =0; c < parent.connections.length; c++)
            {
                var sConn = parent.connections[c];
                var cid = '(' + sConn.sourceID + ',' + sConn.targetID + ')';
                sessionObject.newConnections[cid] = sConn;
            }
        }
    };

	self.createNextGenome = function(parents, sessionObject)
    {
    	//make sure to have session object setup
		sessionObject.newConnections = sessionObject.newConnections || {};
		//nodes is just an array -- doesn't really do much ...
		sessionObject.newNodes = sessionObject.newNodes || [];

        self.markParentConnections(parents,sessionObject);

        //IF we have 0 parents, we create a genome with the default configurations
        var ng;
        var initialMutationCount = self.options.initialMutationCount || 0,
            postXOMutationCount = self.options.postMutationCount || 0;

        var responsibleParents = [];

        switch(parents.length)
        {
            case 0:
            	throw new Error("Cannot create new NEAT genome in win-NEAT without any parents.")
            case 1:

                //we have one parent
                //asexual reproduction
                ng = parents[0].createOffspringAsexual(sessionObject.newNodes, sessionObject.newConnections, self.neatParameters);

                //parent at index 0 responsible
                responsibleParents.push(0);

                for(var m=0; m < postXOMutationCount; m++)
                    ng.mutate(sessionObject.newNodes, sessionObject.newConnections, self.neatParameters);

                break;
            default:
                //greater than 1 individual as a possible parent

                //at least 1 parent, and at most self.activeParents.count # of parents
                var parentCount = 1 + wMath.next(parents.length);

                if(parentCount == 1)
                {
                    //select a single parent for offspring
                    var rIx = wMath.next(parents.length);

                    ng = parents[rIx].createOffspringAsexual(sessionObject.newNodes, sessionObject.newConnections, self.neatParameters);
                    //1 responsible parent at index 0
                    responsibleParents.push(rIx);
                    break;
                }

                //we expect active parents to be small, so we grab parentCount number of parents from a small array of parents
                var parentIxs = selectXFromSmallObject(parentCount, parents);

                var p1 = parents[parentIxs[0]], p2;
                //if I have 3 parents, go in order composing the objects

                responsibleParents.push(parentIxs[0]);

                //p1 mates with p2 to create o1, o1 mates with p3, to make o2 -- p1,p2,p3 are all combined now inside of o2
                for(var i=1; i < parentIxs.length; i++)
                {
                    p2 = parents[parentIxs[i]];
                    ng = p1.createOffspringSexual(p2, self.neatParameters);
                    p1 = ng;
                    responsibleParents.push(parentIxs[i]);
                }

                for(var m=0; m < postXOMutationCount; m++)
                    ng.mutate(sessionObject.newNodes, sessionObject.newConnections, self.neatParameters);


                break;
        }

        //we have our genome, let's send it back

        //the reason we don't end it inisde the switch loop is that later, we might be interested in saving this genome from some other purpose
        return {offspring: ng, parentIxs: responsibleParents};
    };

	//need to be able to add our schema
	self.requiredEvents = function() {
		return [
			"schema:addSchema"
		];
	};

	self.initialize = function(done)
    {
    	self.log("Init win-neat encoding");

		//how we talk to the backbone by emitting events
    	var emitter = backbone.getEmitter(self);

		//add our neat genotype schema -- loaded neatschema from another file -- 
		//this is just the standard neat schema type -- others can make neatjs changes that require a different schema
        emitter.emit("schema:addSchema", self.encodingName, neatSchema, function(err)
        {
        	if(err){
        		done(new Error(err));
        		return;
        	}
        	done();
        });
    }


	return self;
}


//define genotypeto/fromjson functions
winneat.genotypeToJSON = genotypeToJSON;
winneat.genotypeFromJSON = genotypeFromJSON;

function genotypeToJSON(ng)
{
    //need to match the schema
    var ngJSON = {nodes:ng.nodes, connections: []};
    for(var i=0; i < ng.connections.length; i++)
    {   
        var conJSON = {};
        var conn = ng.connections[i];
        for(var key in neatSchema.connections)
        {
            if(key != "type")
            {
                conJSON[key] = conn[key];
            }
        }
        ngJSON.connections.push(conJSON);
    }
    return ngJSON;
}

function genotypeFromJSON(ngJSON)
{   
    var nodes = [];

    var inCount = 0;
    var outCount = 0;

    for(var i=0; i < ngJSON.nodes.length; i++)
    {
        var dbNode = ngJSON.nodes[i];

        switch(dbNode.nodeType)
        {
            case NodeType.input:
                inCount++;
                break;
            case NodeType.output:
                outCount++;
                break;
            case NodeType.bias:
            case NodeType.hidden:
            case NodeType.other:
                break;
            default:
                self.log('Erroneous node type: ' + dbNode.nodeType, " Node: ", dbNode);
                throw new Error("Erroneous node type: " + dbNode.nodeType + " in node: " + JSON.stringify(dbNode));
                // break;
        }

        var nNode = new neatNode(dbNode.gid, dbNode.activationFunction, dbNode.layer, {type: dbNode.nodeType});
        nodes.push(nNode);
    }

    var connections = [];

    for(var i=0; i < ngJSON.connections.length; i++)
    {
        //grab connection from db object
        var dbConn = ngJSON.connections[i];

        //convert to our neatConnection -- pretty simple
        var nConn = new neatConnection(dbConn.gid, dbConn.weight, {sourceID: dbConn.sourceID, targetID: dbConn.targetID});

        //push connection object
        connections.push(nConn);
    }

    //here we goooooooooo
    var ng = new neatGenome(ngJSON.wid, nodes, connections, inCount,outCount, false);
    //note the wid we have from the db object (by default this is added)
    ng.wid = ngJSON.wid;
    //we also have parents already set as well -- make sure to transfer this inforas well -- it's very important
    ng.parents = ngJSON.parents;
    //we've converted back to ng
    //we are finished!
    return ng;
}

