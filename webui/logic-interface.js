function buildProof(graph) {
  var proof = {};

  proof.blocks = {};
  graph.getElements().map(
    function (e, i) {
      if (e.get('prototypeElement')) {
        return;
      }
      var block = {};
      var rule, annotation;
      rule = e.get('rule');
      annotation = e.get('annotation');
      assumption = e.get('assumption');
      conclusion = e.get('conclusion');
      if (rule) {
        block.rule = rule.id;
      } else if (annotation) {
        block.annotation = annotation;
      } else if (assumption) {
        block.assumption = assumption;
      } else if (conclusion) {
        block.conclusion = conclusion;
      } else {
        throw new Error("buildProof(): Unknown block type");
      }
      block.number = e.get('number');
      proof.blocks[e.id] = block;
    });

  proof.connections = {};
  graph.getLinks().map(
    function (l, i) {
      var con = {};
      if (isReversed(l)){
        con.to =   makeConnEnd(graph, l.get('source'));
        con.from = makeConnEnd(graph, l.get('target'));
      } else {
        con.from = makeConnEnd(graph, l.get('source'));
        con.to =   makeConnEnd(graph, l.get('target'));
      }
      // The sort key might be absent, when loading an old proof.
      // Gracefully use “something” then.
      con.sortKey = l.get('counter') || 0;
      proof.connections[l.id] = con;
    });
  return proof;
}

function makeConnEnd(graph, x) {
  var c = graph.getCell(x.id);
  if (!c) {
    return null;
  }
  var ret = {};
  ret.block = x.id;
  ret.port = x.port;
  return ret;
}


function processGraph() {
  $("#analysis").val();
  var proof = buildProof(graph);
  var timeBefore = performance.now();
  var analysis = incredibleLogic(logic, task, proof);
  var timeAfter = performance.now();

  $("#took").text("processing took " + (timeAfter - timeBefore).toFixed(1) + "ms");

  if (typeof analysis === 'string' || analysis instanceof String) {
    $("#analysis").val(analysis);
    $("#errors").text(analysis);
    $("#inferredrule svg").empty();
  } else {
    $("#analysis").val(JSON.stringify(analysis, null, 2));
    $("#errors").empty();

    if (task_desc) {
      if (analysis.qed && !(tasks_solved[tasks_solved])) {
        // Give a hint about the switch task bar
        $("#taskbottombar").effect('highlight', {color: "#8f8"}, 3000);
      }
      tasks_solved[task_desc] = analysis.qed;
    }

    // mock
    // analysis.rule = logic.rules[0];

    if (analysis.rule) {
      $("#inferredrule").slideDown();
      $("#inferredrule svg").each(function (n, el) {
        $(el).empty();
        var g = V("<g/>");
        var vel = V(el).append(g);
        var blockDesc = ruleToBlockDesc(analysis.rule);
        blockDesc.canRemove = false;
        blockDesc.isPrototype = true;
        blockDesc.desc = {label: '☃'};
        BlockDescRenderer(g, blockDesc, false).renderToSVG();
        gBB = g.bbox(false);
        g.translate($(el).width()/2, -gBB.y + 5);
        vel.attr({'width': $("#inferredrule").width(), 'height': gBB.height + 10 });
      });
    } else {
      $("#inferredrule").slideUp();
      $("#inferredrule svg").each(function (n, el) {
        $(el).empty();
        // V(el).append(V("<text fill='black'/>").text(i18n.t('nothing')));
      });
    }

    // Reset everything
    $.each(graph.getElements(), function (i, el) {
      el.set('brokenPorts',{});
    });
    $.each(graph.getLinks(), function (i, conn) {
      conn
        .attr({'.connection': {class: 'connection'}})
        .set('labels', []);
    });

    // We set this simly for all elements, even if only
    // the view for conclusion elements listens for it
    $.each(graph.getElements(), function (i, el) {
      el.set('qed', analysis.qed);
    });
    // We _also_ set it on the graph itself, so that the status of a serialized
    // task is immediately visible.
    graph.set('qed', analysis.qed);

    // Collect errors
    $.each(analysis.cycles, function (i, path) {
      $.each(path, function (i, connId) {
        var conn = graph.getCell(connId);
        // not very nice, see http://stackoverflow.com/questions/32010888
        conn.attr({'.connection': {class: 'connection error'}});
      });
    });
    $.each(analysis.escapedHypotheses, function (i, path) {
      $.each(path, function (i, connId) {
        var conn = graph.getCell(connId);
        // not very nice, see http://stackoverflow.com/questions/32010888
        conn.attr({'.connection': {class: 'connection error'}});
      });
    });

    $.each(analysis.unconnectedGoals, function (i, goal) {
      if (goal.block) {
        el = graph.getCell(goal.block);
	var bp = _.clone(el.get('brokenPorts'));
	bp[goal.port] = true;
	el.set('brokenPorts', bp);
      }
      if (goal.conclusion) {
        $.each(graph.getElements(), function (i, el) {
          if (el.get('conclusion') && el.get('conclusion') == goal.conclusion) {
            el.set('brokenPorts',{in:true});
          }
        });
      }
    });

    $.each(graph.getLinks(), function (i, conn) {
      var propFrom;
      var x;
      if (conn.get('source')) {
        x = conn.get('source');
        if (x.id) {
          propFrom = analysis.portLabels[x.id][x.port];
        }
      }
      var propTo;
      if (conn.get('target')) {
        x = conn.get('target');
        if (x.id) {
          propTo = analysis.portLabels[x.id][x.port];
        }
      }

      conn.attr({'.label text': {'font-size': '14px'}});

      var stat = analysis.connectionStatus[conn.id] || "unconnected";

      if (stat == "failed" || stat == "dunno") {
        var symbol;
        if (stat == "failed")   {symbol = "☠";}
        else if (stat == "dunno") {symbol = "?";}
        else {throw Error("processGraph: Unknown connection label type");}

        // not very nice, see http://stackoverflow.com/questions/32010888
        conn.attr({'.connection': {class: 'connection error'}});

        if (isReversed(conn)) {
          f = function (pos) {return 1-pos;};
        } else {
          f = function (pos) {return pos;};
        }

        conn.set('labels', [{
          position: f(0.1),
          attrs: {
            text: {
              text: propFrom
            }
          }
        },
          {
            position: f(0.5),
            attrs: {
              text: {
                text: symbol
              }
            }
          },
          {
            position: f(0.9),
            attrs: {
              text: {
                text: propTo
              }
            }
          }
        ]);
      } else if (stat == "solved") {
        conn.set('labels', [{
          position: 0.5,
          attrs: {
            text: {
              text: propFrom
            }
          }
        }]);
      } else if (stat == "unconnected") {
        conn.set('labels', [{
          position: 0.5,
          attrs: {
            text: {
              text: propFrom || propTo
            }
          }
        }]);
      } else {
        throw new Error("processGraph(): Unknown connection status: " + stat);
      }
    });
  }
}
function isReversed(conn) {
  // A connection is reversed if its source is an "in" magnet, or the target an
  // "out" magnet.
  var source = conn.get('source');
  var el;
  var rule;
  if (source.id) {
    el = graph.getCell(source.id);
    if (el.get('conclusion')) {
      return true;
    }
    if (el.get('annotation')) {
      if (source.port == "in") {
        return true;
      }
    }
    rule = el.get('rule');
    if (rule) {
      if (rule.ports[source.port].type == "assumption") {
        return true;
      }
    }
  }
  var target = conn.get('target');
  if (target.id) {
    el = graph.getCell(target.id);
    if (el.get('assumption')) {
      return true;
    }
    if (el.get('annotation')) {
      if (target.port == "out") {
        return true;
      }
    }
    rule = el.get('rule');
    if (rule) {
      if (rule.ports[target.port].type == "conclusion") {
        return true;
      }
      if (rule.ports[target.port].type == "local hypothesis") {
        return true;
      }
    }
  }
  return false;
}
