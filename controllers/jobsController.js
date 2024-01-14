const Job = require('../models/jobs');

const geoCoder = require('../utils/geocoder');
const ErrorHandler = require('../utils/errorHandler');
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const APIFilters = require('../utils/apiFilters');
const path = require('path');

// Get all jobs  => /api/v1/jobs
exports.getJobs = catchAsyncErrors (async (req, res, next) => {

    const apiFilters = new APIFilters(Job.find(), req.query)
        .filter()
        .sort()
        .limitFields()
        .searchByQuery()
        .pagination();

    const jobs = await apiFilters.query;

    res.status(200).json({
        success : true,
        results : jobs.length,
        data : jobs
    });
});

// Get a single job with id and slug => /api/v1/job/:id/:slug
exports.getJob = catchAsyncErrors (async (req, res, next) => {

    const job = await Job.find({$and: [{_id : req.params.id}, {slug : req.params.slug}]});

    if(!job || job.length === 0){
        return next(new ErrorHandler('Job not found', 404));
    }

    res.status(200).json({
        success : true,
        result : job.length,
        data : job
    });
});

// Create a new Job =>  /api/v1/job/new
exports.newJob = catchAsyncErrors (async (req, res, next) => {
    
    // Adding user to body
    req.body.user = req.user.id;    

    const job = await Job.create(req.body);

    res.status(200).json({
        success : true,
        message : 'Job Created',
        data : job
    });
});

// Update a Job => api/v1/job/:id
exports.updateJob = catchAsyncErrors (async (req, res, next) => {

    let job = await Job.findById(req.params.id);

    if(!job){
        return next(new ErrorHandler('Job not found', 404));
    }

    job = await Job.findByIdAndUpdate(req.params.id, req.body,{
        new : true,
        runValidators : true,
        useFindAndModify : false
    });

    res.status(200).json({
        success : true,
        message : 'Job is updated.',
        data : job
    });
});

// Delete a Job => /api/v1/job/:id
exports.deleteJob = catchAsyncErrors (async (req, res, next) => {
    let job = await Job.findById(req.params.id);

    if(!job){
        return next(new ErrorHandler('Job not found', 404));
    }

    job = await Job.findByIdAndDelete(req.params.id);

    res.status(200).json({
        success : true,
        message : 'Job is deleted.'
    });
});

// Search jobs with radius => /api/v1/jobs/:zipcode/:distance
exports.getJobsInRadius = catchAsyncErrors (async (req, res, next) => {
    const { zipcode, distance } = req.params

    const loc = await geoCoder.geocode(zipcode);
    const latitude = loc[0].latitude;
    const longitude = loc[0].longitude;

    const radius = distance/ 3963;

    const jobs = await Job.find({
        location : {$geoWithin : {$centerSphere : [[longitude, latitude], radius]
        }}
    });

    res.status(200).json({
        success : true,
        result : jobs.length,
        data : jobs
    });
});

// Get stats about a topic(job) => /api/v1/stats/:topic
exports.jobStats = catchAsyncErrors (async (req, res, next) => {
    const stats = await Job.aggregate([
        {
            $match : {$text : {$search : "\""+ req.params.topic + "\""}}
        },
        {
            $group : {
                _id : {$toUpper : '$experience'}, 
                totalJobs : {$sum : 1},
                avgPosition : {$avg : '$positions'},
                avgSalary : {$avg : '$salary'},
                minSalary : {$min : '$salary'},
                maxSalary : {$max : '$salary'}
            }
        }
    ]);

    if(stats.length === 0){
        return next(new ErrorHandler( `No stats found for - ${req.params.topic}`, 404));
    }

    res.status(200).json({
        success : true,
        data : stats
    });
});

// Apply to job using resume =>  /api/v1/job/:id/apply
exports.applyJob = catchAsyncErrors( async(req, res, next) => {
    let job = await Job.findById(req.params.id).select('+applicantsApplied');

    if(!job){
        return next(new ErrorHandler('Job not found.', 404));
    }

    // Check that if job's last date has been passed or not 
    if(job.lastDate < new Date(Date.now())){
        return next(new ErrorHandler('You can not apply to this job. Date is over.', 400));
    }

    // Check if user has applied before
    for(let i=0; i< job.applicantsApplied.length; i++){
        if(job.applicantsApplied[i].id === req.user.id){
            return next(new ErrorHandler('You have already applied to this job.', 400));
        }
    }

    // Check the files
    if(!req.files){
        return next(new ErrorHandler('Please upload a file.', 400));
    }

    const file = req.files.file;

    // Check file type
    const supportedFiles = /.docs|.pdf/;

    if(!supportedFiles.test(path.extname(file.name))){
        return next(new ErrorHandler('Please upload document file.', 400));
    }

    // Check document size
    if(file.size > process.env.MAX_FILE_SIZE){
        return next(new ErrorHandler('Please upload file less than 2 MB.', 400));
    }

    //Renaming resume
    file.name = `${req.user.name.replace(' ', '_')}_${job._id}${path.parse(file.name).ext}`;

    file.mv(`${process.env.UPLOAD_PATH}/${file.name}`, async err =>{
        if(err){
            return next(new ErrorHandler('Resume upload failed.', 500));
        }

        await Job.findByIdAndUpdate(req.params.id, {
            $push : {
                applicantsApplied : {
                    id : req.user.id,
                    resume : file.name
                }
            }},
        {
            new : true,
            runValidators : true,
            useFindAndModify : false
        });

        res.status(200).json({            
            success : true,
            message : 'Applies for the job successfully',
            data : file.name
        })
    });
});