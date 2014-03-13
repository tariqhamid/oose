'use strict';
module.exports = function(grunt){

  //config
  grunt.initConfig({
    nodemon: {
      options: {
        watchedExtensions: ['js']
      },
      serve: {
        options: {
          file: './serve/app.js',
          watchedFolders: ['./serve']
        },
        dev: {
          options: {nodeArgs: ['--debug']}
        },
        production: {}
      }
    },
    jshint: {
      options: {
        jshintrc: true,
        reporter: require('jshint-stylish')
      },
      common: ['./*.js'],
      serve: ['serve/*.js']
    },
    mochaTest: {
      options: {
        reporter: 'spec'
      },
      serve: {src: ['serve/test/*.test.js']}
    },
    watch: {
      serve: {files: ['serve/*.js'],tasks: ['test:serve']}
    },
    concurrent: {
      options: {logConcurrentOutput: true},
      serve: {tasks: ['nodemon:serve:dev','watch:serve']}
    },
    projectUpdate: {update: {}}
  })

  //load tasks
  grunt.loadNpmTasks('grunt-concurrent')
  grunt.loadNpmTasks('grunt-contrib-jshint')
  grunt.loadNpmTasks('grunt-contrib-watch')
  grunt.loadNpmTasks('grunt-mocha-test')
  grunt.loadNpmTasks('grunt-nodemon')
  grunt.loadNpmTasks('grunt-project-update')

  //macros
  grunt.registerTask('update',['projectUpdate'])
  grunt.registerTask('test',['jshint','mochaTest'])
  grunt.registerTask('dev',['concurrent'])
  grunt.registerTask('start',['nodemon:serve:production'])

}