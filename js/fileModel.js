// Copied from TCozy, with additional ways to bind to the data.
// -trs, 8 Feb 2017
//
// Proxy the native HTML FileList object from an <input type="file"> element to
// a model value in the element's angular scope.  At a minimum, register the
// directive with the "file-model" attribute.  This attribute and others may
// have optional values for additional behaviour:
//
//   file-model="model.file"   # registers directive and optionally one-way binds
//                             # File object to a model variable.  Caution!  Angular
//                             # doc claims that it can't watch File objects
//                             # properly since it can't copy them.  Maybe use
//                             # file-data instead?
//
//   file-name="model.name"    # one-way binds the File object's name property to a model variable
//   file-data="model.data"    # one-way binds the File object's data to a model variable
//   file-data-as="Text"       # determines how to read data for file-data: DataURL (default) or Text
//
// Note that one-way binding in this context means the file input element
// updates the model variables but not vice versa.
//
// Loosely based on snippet from:
//   https://uncorkedstudios.com/blog/multipartformdata-file-upload-with-angularjs
(function(){
  'use strict';

  angular
    .module('fileModel', [])
    .directive('fileModel', directive);

  directive.$inject = ['$parse', '$log'];

  function directive($parse, $log) {
    return {
      restrict: 'A',
      link: function (elementScope, element, attrs, ctrl) {
        var fileModel       = $parse(attrs.fileModel);
        var nameModel       = $parse(attrs.fileName);
        var dataModel       = $parse(attrs.fileData);
        var dataAs          = attrs.fileDataAs || "DataURL";
        var fileModelSetter = fileModel.assign;
        var nameModelSetter = nameModel.assign;
        var dataModelSetter = dataModel.assign;

        if (!fileModelSetter && !nameModelSetter && !dataModelSetter) {
          $log.error("<input file-model> without binding a model to any supported attribute is useless; ignoring this element");
          return;
        }

        if ('multiple' in attrs)
          $log.warn("<input file-model> doesn't support the 'multiple' attribute; using the first file");

        element.bind('change', function(){
          var file = element[0].files[0];

          function updateModel(scope, data) {
            if (fileModelSetter)
              fileModelSetter(scope, file);
            if (nameModelSetter)
              nameModelSetter(scope, file ? file.name : null);
            if (dataModelSetter)
              dataModelSetter(scope, data);
          }

          if (dataModelSetter && file) {
            // Read the file and then set the model only on success
            var reader = new FileReader();
            reader.onloadend = function(){
              var data = this.result;
              elementScope.$apply(function(scope){
                updateModel(scope, data);
              });
            };
            reader.onerror = function(){
              $log.error("Error reading file upload: ", this.error);
            };

            reader["readAs" + dataAs](file);
          } else {
            // No need to read the File object
            elementScope.$apply(updateModel);
          }
        });
      }
    };
  }

})();
