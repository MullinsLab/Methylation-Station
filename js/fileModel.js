// Provide easy access browser-created File objects either from <input type="file">
// elements or drag-and-drop events.
//
// The file-model directive provides access from within an angular scope to the
// native HTML File object from an <input type="file"> element.
//
// The file-drop directive does the same for drag-and-drop events on an
// element.
//
// At a minimum, register the primary directive with the "file-model" or
// "file-drop" attributes.  These attributes and others may have optional
// values for additional behaviour:
//
//   file-model="model.file"   # registers directive and optionally one-way binds
//   file-drop="model.file"    # File object to a model variable.  Caution!  Angular
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
// Also note that multiple files are not supported at this time, although both
// file inputs and drag-and-drop events support FileList objects.
//
// Initially based on a similar directive in TCozy, which was itself loosely
// based on snippet from:
//   https://uncorkedstudios.com/blog/multipartformdata-file-upload-with-angularjs
//
(function(){
  'use strict';

  angular
    .module('fileModel', [])
    .directive('fileModel', fileModel)
    .directive('fileDrop', fileDrop);


  fileModel.$inject = ['$parse', '$log'];

  function fileModel($parse, $log) {
    return {
      restrict: 'A',
      link: function (elementScope, element, attrs, ctrl) {
        let update = generateUpdater("file-model", attrs, $parse, $log);

        element.bind('change', () => {
          // Do nothing if we have no files, else update.
          if (!element[0].files)
            return;

          update(elementScope, element[0].files);

          // Reset the input value so the event is triggered on every file
          // selection, not just if the filename changed.  This is
          // important for two reasons:
          //
          // 1. The file may have changed on disk, behooving us to reload
          //    it, and since we're rendering locally there's little penalty
          //    in re-reading and rendering the file.
          //
          // 2. With the addition of another file selection method (drag
          //    and drop), this input may be seen as unchanged even if the
          //    currently loaded file in the app doesn't match the input
          //    value.  For example, try loading file A with the file chooser,
          //    then file B with drag and drop, and then reloading file A
          //    again with the file chooser.  Without this reset, nothing
          //    would happen.
          //
          element[0].value = null;
        });
      }
    }
  }


  fileDrop.$inject = ['$parse', '$log'];

  function fileDrop($parse, $log) {
    return {
      restrict: 'A',
      link: function (elementScope, element, attrs, ctrl) {
        let update = generateUpdater("file-drop", attrs, $parse, $log);

        // Prevent default to allow drag
        element.bind("dragover", (ev) => { ev.preventDefault() });

        // Highlight the dropzone
        element.bind("dragenter", () => {
          element[0].classList.add("file-drop-hover");
        });

        // Remove dropzone highlight
        element.bind("dragend", (ev) => {
          element[0].classList.remove("file-drop-hover");
        });

        // Handle drop
        element.bind("drop", (ev) => {
          ev.preventDefault();
          element[0].classList.remove("file-drop-hover");
          update(elementScope, ev.dataTransfer.files);
        });
      }
    }
  }


  function generateUpdater(directiveName, attrs, $parse, $log) {
    var directiveAttr   = attrs.$normalize(directiveName);
    var fileModel       = $parse(attrs[directiveAttr]);
    var nameModel       = $parse(attrs.fileName);
    var dataModel       = $parse(attrs.fileData);
    var dataAs          = attrs.fileDataAs || "DataURL";
    var fileModelSetter = fileModel.assign;
    var nameModelSetter = nameModel.assign;
    var dataModelSetter = dataModel.assign;

    if (!fileModelSetter && !nameModelSetter && !dataModelSetter) {
      $log.error("<input " + directiveName + "> without binding a model to any supported attribute is useless; ignoring this element");
      return;
    }

    if ('multiple' in attrs)
      $log.warn("<input " + directiveName + "> doesn't support the 'multiple' attribute; using the first file");

    return function update(elementScope, files) {
      var file = files[0];

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
    }
  }

})();
