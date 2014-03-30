//We must test the ability to generate genotypes, force parents, and create valid offspring according to the schema

var assert = require('assert');
var should = require('should');
var colors = require('colors');
var Q = require('q');

var util = require('util');

var seed = require('./seed1.js');

var ngSeed= seed.genome;

var winneat = require('..');
var wMath = require('win-utils').math;
var winback = require('win-backbone');

var backbone, generator, backEmit, backLog;
var evoTestEnd;
var count = 0;

var emptyModule = 
{
	winFunction : "test",
	eventCallbacks : function(){ return {}; },
	requiredEvents : function() {
		return [
			"generator:createArtifacts"
			];
	},
	initialize : function(done)
    {
        process.nextTick(function()
        {
            done();
        })
    }
};
var cIx = 0;

var qBackboneResponse = function()
{
    var defer = Q.defer();
    // self.log('qBBRes: Original: ', arguments);

    //first add our own function type
    var augmentArgs = arguments;
    // [].splice.call(augmentArgs, 0, 0, self.winFunction);
    //make some assumptions about the returning call
    var callback = function(err)
    {
        if(err)
        {
            defer.reject(err);
        }
        else
        {
            //remove the error object, send the info onwards
            [].shift.call(arguments);
            if(arguments.length > 1)
                defer.resolve(arguments);
            else
                defer.resolve.apply(defer, arguments);
        }
    };

    //then we add our callback to the end of our function -- which will get resolved here with whatever arguments are passed back
    [].push.call(augmentArgs, callback);

    // self.log('qBBRes: Augmented: ', augmentArgs);
    //make the call, we'll catch it inside the callback!
    backEmit.apply(backEmit, augmentArgs);

    return defer.promise;
}

describe('Testing win-NEAT for: ',function(){

    //we need to start up the WIN backend
    before(function(done){

    	//do this up front yo
    	backbone = new winback();


    	var sampleJSON = 
		{
			"win-neat" : winneat,
			"win-gen" : "win-gen",
			"win-schema" : "win-schema",
			"test" : emptyModule
		};
		var configurations = 
		{
			"global" : {
			},
			"win-neat" : {
				options : {
					initialMutationCount : 0, 
					postMutationCount : 0
				}
				,logLevel : backbone.testing
			},
			"win-gen" : {
				"encodings" : [
					"NEATGenotype"
				]
				,validateParents : true
				,validateOffspring : true
				,logLevel : backbone.testing
			},
			"win-schema" : {
				multipleErrors : true
				// ,logLevel : backbone.testing
			}
		};

    	backbone.logLevel = backbone.testing;

    	backEmit = backbone.getEmitter(emptyModule);
    	backLog = backbone.getLogger({winFunction:"mocha"});
    	backLog.logLevel = backbone.testing;

    	//loading modules is synchronous
    	backbone.loadModules(sampleJSON, configurations);

    	var registeredEvents = backbone.registeredEvents();
    	var requiredEvents = backbone.moduleRequirements();
    		
    	backLog('Backbone Events registered: ', registeredEvents);
    	backLog('Required: ', requiredEvents);

    	backbone.initializeModules(function()
    	{
    		backLog("Finished Module Init");
 			done();
    	});

    });

    it('validating generated genomes match forced parent choices',function(done){

    	//use a single object as a seed

    	var second = JSON.parse(JSON.stringify(ngSeed));
    	second.wid = "54321";

    	var seeds = [ngSeed, second];

    	//how many to generate
    	var offcount = 10;

    	var chosenIx = 1;

    	//force the second parent to be always chosen
    	var force = [];
    	//add a list of lists with a single chosen ix inside
    	for(var i=0; i < offcount; i++)
    		force.push([chosenIx]);

    	//win-gen should default session, but this will ensure a common session we can check for new nodes and connections
    	//after the creation step
    	var session = {forceParents: force};

    	//now we call asking for 
    	qBackboneResponse("generator:createArtifacts", "NEATGenotype", offcount, seeds, session)
    		.then(function(artifacts)
    		{
    			//evolution started!
    			backLog('\tFinished creating neat genoems: '.cyan, util.inspect(artifacts, false,10));
    			backLog('\tSession: ', session);

    			var offspring = artifacts.offspring;

    			for(var i=0; i < offcount; i++){
    				var parents = offspring[i].parents;
    				// backLog("Off parents: ".red, parents);
    				//should only be one parent (the chosen one)
    				parents.length.should.equal(1);
    				//the parents wid should equal the chosen seeds wid
    				parents[0].should.equal(seeds[chosenIx].wid);
    			}


		    	done();   
    		})
    		.fail(function(err)
    		{
    			backLog("Failure: ", util.inspect(err.errors, false,10));

    			if(err.errno)
    				done(err);
    			else
    				done(new Error(err.message));
    		});
    
    });
});







