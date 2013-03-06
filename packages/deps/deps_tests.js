Tinytest.add('deps - run', function (test) {
  var d = new Deps.Variable;
  var x = 0;
  var handle = Deps.run(function (handle) {
    Deps.depend(d);
    ++x;
  });
  test.equal(x, 1);
  Deps.flush();
  test.equal(x, 1);
  d.changed();
  test.equal(x, 1);
  Deps.flush();
  test.equal(x, 2);
  d.changed();
  test.equal(x, 2);
  Deps.flush();
  test.equal(x, 3);
  d.changed();
  // Prevent the function from running further.
  handle.stop();
  Deps.flush();
  test.equal(x, 3);
  d.changed();
  Deps.flush();
  test.equal(x, 3);

  Deps.run(function (internalHandle) {
    Deps.depend(d);
    ++x;
    if (x == 6)
      internalHandle.stop();
  });
  test.equal(x, 4);
  d.changed();
  Deps.flush();
  test.equal(x, 5);
  d.changed();
  // Increment to 6 and stop.
  Deps.flush();
  test.equal(x, 6);
  d.changed();
  Deps.flush();
  // Still 6!
  test.equal(x, 6);
});

Tinytest.add("deps - nested run", function (test) {
  var a = new Deps.Variable;
  var b = new Deps.Variable;
  var c = new Deps.Variable;
  var d = new Deps.Variable;
  var e = new Deps.Variable;
  var f = new Deps.Variable;

  var buf = "";

  var c1 = Deps._newComputation(function () {
    Deps.depend(a);
    buf += 'a';
    Deps.run(function () {
      Deps.depend(b);
      buf += 'b';
      Deps.run(function () {
        Deps.depend(c);
        buf += 'c';
        var c2 = Deps._newComputation(function () {
          Deps.depend(d);
          buf += 'd';
          Deps.run(function () {
            Deps.depend(e);
            buf += 'e';
            Deps.run(function () {
              Deps.depend(f);
              buf += 'f';
            });
          });
          Deps.onInvalidate(function () {
            // only run once
            c2.stop();
          });
        });
        Deps.onInvalidate(function () {
          // link to parent explicitly
          c2.stop();
        });
      });
    });
    Deps.onInvalidate(function (c1) {
      c1.stop();
    });
  });

  var expect = function (str) {
    test.equal(buf, str);
    buf = "";
  };

  expect('abcdef');

  b.changed();
  expect(''); // didn't flush yet
  Deps.flush();
  expect('bcdef');

  c.changed();
  Deps.flush();
  expect('cdef');

  var changeAndExpect = function (v, str) {
    v.changed();
    Deps.flush();
    expect(str);
  };

  // should cause running
  changeAndExpect(e, 'ef');
  changeAndExpect(f, 'f');
  // invalidate inner context
  changeAndExpect(d, '');
  // no more running!
  changeAndExpect(e, '');
  changeAndExpect(f, '');
  // rerun C
  changeAndExpect(c, 'cdef');
  changeAndExpect(e, 'ef');
  changeAndExpect(f, 'f');
  // rerun B
  changeAndExpect(b, 'bcdef');
  changeAndExpect(e, 'ef');
  changeAndExpect(f, 'f');
  // kill A
  a.changed();
  // This flush would be unnecessary if outstanding callbacks
  // were processed in the containment order of their contexts
  // (i.e. parents before children)
  Deps.flush();
  changeAndExpect(f, '');
  changeAndExpect(e, '');
  changeAndExpect(d, '');
  changeAndExpect(c, '');
  changeAndExpect(b, '');
  changeAndExpect(a, '');

  test.isFalse(a.hasDependents());
  test.isFalse(b.hasDependents());
  test.isFalse(c.hasDependents());
  test.isFalse(d.hasDependents());
  test.isFalse(e.hasDependents());
  test.isFalse(f.hasDependents());
});

Tinytest.add("deps - flush", function (test) {

  var buf = "";

  var c1 = Deps.run(function (c) {
    buf += 'a';
    // invalidate first time
    if (c.firstRun)
      c.invalidate();
  });

  test.equal(buf, 'a');
  Deps.flush();
  test.equal(buf, 'aa');
  Deps.flush();
  test.equal(buf, 'aa');
  c1.stop();
  Deps.flush();
  test.equal(buf, 'aa');

  /////
  // Can't cause rerun nested in run

  buf = "";

  var c2 = Deps.run(function (c) {
    buf += 'a';
    // invalidate first time
    if (c.firstRun)
      c.invalidate();

    Deps.onInvalidate(function () {
      buf += "<";
    });
    Deps.afterInvalidate(function () {
      buf += ">";
    });

    if (c.firstRun)
      Meteor.flush();
  });

  test.equal(buf, 'a');
  Deps.flush();
  test.equal(buf, 'a<a>');
  c2.stop();
  Deps.flush();
  test.equal(buf, 'a<a><>');

  /////
  // Can flush a diferent run from a run;
  // no current computation in onInvalidate

  buf = "";

  var c3 = Deps.run(function (c) {
    buf += 'a';
    // invalidate first time
    if (c.firstRun)
      c.invalidate();
    Deps.onInvalidate(function () {
      buf += (Deps.active ? "1" : "0");
    });
  });

  var c4 = Deps.run(function (c) {
    c4 = c;
    buf += 'b';
    Meteor.flush();
    buf += 'b';
  });

  test.equal(buf, 'ab0ab');
  c3.stop();
  c4.stop();
  Deps.flush();

});