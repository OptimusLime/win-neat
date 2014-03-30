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

    it('validating generated genomes match pre-defined schema',function(done){

    	//use a single object as a seed
    	var seeds = [ngSeed];

    	//how many to generate
    	var offcount = 10;

    	//win-gen should default session, but this will ensure a common session we can check for new nodes and connections
    	//after the creation step
    	var session = {};

    	//now we call asking for 
    	qBackboneResponse("generator:createArtifacts", "NEATGenotype", offcount, seeds, session)
    		.then(function(artifacts)
    		{
    			//evolution started!
    			backLog('\tFinished creating neat genoems: '.cyan, util.inspect(artifacts, false,10));
    			backLog('\tSession: ', session);
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







