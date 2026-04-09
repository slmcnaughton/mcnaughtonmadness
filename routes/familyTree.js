var express = require("express");
var router = express.Router();
var middleware = require("../middleware");
var User = require("../models/user");
var FamilyMember = require("../models/familyMember");
var FamilyRelationship = require("../models/familyRelationship");

// Lazy-load so the app still starts if packages aren't installed
var upload;
try {
  var cloudinaryConfig = require("../config/cloudinary");
  upload = cloudinaryConfig.upload;
} catch (e) {
  console.log("[WARN] Cloudinary packages not installed. Photo uploads disabled.");
  upload = { single: function () { return function (req, res, next) { next(); }; } };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTE — View the family tree (approved members only)
// ═══════════════════════════════════════════════════════════════════════════

router.get("/", middleware.isLoggedIn, async function (req, res) {
  try {
    // Security gate: only allow family tree members, admins, or users who
    // have participated in an OFFICIAL tournament group. Prevents bots from
    // creating accounts just to harvest family data (e.g. maiden names).
    // Non-official groups (e.g. a work pool) don't grant access.
    if (req.user.familyTreeId || req.user.isAdmin) {
      return await loadFamilyTree(req, res);
    }

    // Check embedded groups first (fast path for new joins)
    var hasOfficialGroup = req.user.tournamentGroups && req.user.tournamentGroups.some(function (g) {
      return g.isOfficial;
    });

    if (hasOfficialGroup) {
      return await loadFamilyTree(req, res);
    }

    // Fallback for legacy data: check the DB in case the user's embedded
    // docs predate the isOfficial field. Look up their group IDs and see
    // if any are official.
    var groupIds = (req.user.tournamentGroups || []).map(function (g) { return g.id; });
    if (groupIds.length === 0) {
      req.flash("error", "The family tree is available to members of the official McNaughton Madness group.");
      return res.redirect("/tournamentGroups");
    }

    var TournamentGroup = require("../models/tournamentGroup");
    var officialGroup = await TournamentGroup.findOne({ _id: { $in: groupIds }, isOfficial: true });
    if (!officialGroup) {
      req.flash("error", "The family tree is available to members of the official McNaughton Madness group.");
      return res.redirect("/tournamentGroups");
    }
    // They're legit — backfill the isOfficial flag so this DB check isn't needed next time
    req.user.tournamentGroups.forEach(function (g) {
      if (g.id && g.id.toString() === officialGroup._id.toString()) {
        g.isOfficial = true;
      }
    });
    await req.user.save();
    return await loadFamilyTree(req, res);
  } catch (err) {
    console.log(err);
    req.flash("error", "Error loading family tree.");
    res.redirect("/users");
  }
});

async function loadFamilyTree(req, res) {
  var members = await FamilyMember.find({ approved: true }).populate("user");
  var relationships = await FamilyRelationship.find({});

  // Build adjacency map
  var memberMap = {};
  members.forEach(function (m) {
    memberMap[m._id.toString()] = m;
  });

  // Build tree data
  var treeData = buildTree(members, relationships, memberMap);

  // If user is on the family tree, fetch their relationships for self-service section
  var userFamilyId = req.user.familyTreeId ? req.user.familyTreeId.toString() : null;
  var hasPendingConnection = !!(req.user.pendingConnectionType && req.user.pendingConnectionName);

  if (userFamilyId) {
    var myRelationships;
    try {
      myRelationships = await FamilyRelationship.find({
        $or: [{ from: req.user.familyTreeId }, { to: req.user.familyTreeId }],
      })
        .populate("from to");
    } catch (err) {
      myRelationships = [];
    }

    var myPartnerRels = myRelationships.filter(function (r) {
      return ["spouse", "fiance", "dating"].indexOf(r.type) !== -1;
    });

    res.render("familyTree/index", {
      page: "familyTree",
      treeData: treeData,
      members: members,
      relationships: relationships,
      memberMap: memberMap,
      myRelationships: myPartnerRels,
      userFamilyId: userFamilyId,
      hasPendingConnection: hasPendingConnection,
    });
  } else {
    // User not on the tree — still show it, but no self-service section
    res.render("familyTree/index", {
      page: "familyTree",
      treeData: treeData,
      members: members,
      relationships: relationships,
      memberMap: memberMap,
      myRelationships: [],
      userFamilyId: null,
      hasPendingConnection: hasPendingConnection,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tree Builder — assembles hierarchy from flat data
// ═══════════════════════════════════════════════════════════════════════════

function buildTree(members, relationships, memberMap) {
  // Find all parent relationships
  var parentRels = relationships.filter(function (r) {
    return r.type === "parent";
  });

  // Find partner relationships (spouse, fiance, dating)
  var partnerTypes = ["spouse", "fiance", "dating"];
  var partnerRels = relationships.filter(function (r) {
    return partnerTypes.indexOf(r.type) !== -1;
  });

  // Build children map: parentId → [childId]
  var childrenOf = {};
  parentRels.forEach(function (r) {
    var parentId = r.from.toString();
    var childId = r.to.toString();
    if (!childrenOf[parentId]) childrenOf[parentId] = [];
    childrenOf[parentId].push(childId);
  });

  // Build partner map: personId → [{ id, type }] (supports multiple partners)
  var partnerOf = {};
  partnerRels.forEach(function (r) {
    var fromId = r.from.toString();
    var toId = r.to.toString();
    if (!partnerOf[fromId]) partnerOf[fromId] = [];
    partnerOf[fromId].push({ id: toId, type: r.type });
    if (!partnerOf[toId]) partnerOf[toId] = [];
    partnerOf[toId].push({ id: fromId, type: r.type });
  });

  // Find parents of each person
  var parentsOf = {};
  parentRels.forEach(function (r) {
    var childId = r.to.toString();
    if (!parentsOf[childId]) parentsOf[childId] = [];
    parentsOf[childId].push(r.from.toString());
  });

  // Convert sibling relationships → shared-parent relationships
  // If A is sibling of B and B has parents, make A a child of those same parents
  var siblingRels = relationships.filter(function (r) {
    return r.type === "sibling";
  });
  siblingRels.forEach(function (r) {
    var aId = r.from.toString();
    var bId = r.to.toString();
    if (!memberMap[aId] || !memberMap[bId]) return;

    var aParents = parentsOf[aId] || [];
    var bParents = parentsOf[bId] || [];

    if (bParents.length > 0 && aParents.length === 0) {
      bParents.forEach(function (parentId) {
        if (!childrenOf[parentId]) childrenOf[parentId] = [];
        if (childrenOf[parentId].indexOf(aId) === -1) childrenOf[parentId].push(aId);
        if (!parentsOf[aId]) parentsOf[aId] = [];
        if (parentsOf[aId].indexOf(parentId) === -1) parentsOf[aId].push(parentId);
      });
    } else if (aParents.length > 0 && bParents.length === 0) {
      aParents.forEach(function (parentId) {
        if (!childrenOf[parentId]) childrenOf[parentId] = [];
        if (childrenOf[parentId].indexOf(bId) === -1) childrenOf[parentId].push(bId);
        if (!parentsOf[bId]) parentsOf[bId] = [];
        if (parentsOf[bId].indexOf(parentId) === -1) parentsOf[bId].push(parentId);
      });
    }
  });

  // Find root nodes (members with no parents)
  var roots = members.filter(function (m) {
    return !parentsOf[m._id.toString()];
  });

  // Find root couple (a root member who has at least one partner)
  var rootCouple = null;
  var processedIds = {};

  for (var i = 0; i < roots.length; i++) {
    var rootId = roots[i]._id.toString();
    if (processedIds[rootId]) continue;

    var rootPartners = partnerOf[rootId] || [];
    if (rootPartners.some(function (p) { return memberMap[p.id]; })) {
      rootCouple = { person: roots[i] };
      processedIds[rootId] = true;
      // Mark partners so they aren't picked as separate roots
      rootPartners.forEach(function (p) { processedIds[p.id] = true; });
      break;
    }
  }

  if (!rootCouple && roots.length > 0) {
    rootCouple = { person: roots[0] };
    processedIds[roots[0]._id.toString()] = true;
  }

  if (!rootCouple) {
    return { familyUnits: [], friends: [], extendedFamily: [] };
  }

  // Recursively build family units (supports multiple partners per person)
  function buildFamilyUnit(personId) {
    var person = memberMap[personId];
    if (!person) return null;

    // Collect all partners for this person
    var partners = [];
    var partnerInfos = partnerOf[personId] || [];
    partnerInfos.forEach(function (pi) {
      if (memberMap[pi.id] && !processedIds[pi.id]) {
        partners.push({ member: memberMap[pi.id], type: pi.type });
        processedIds[pi.id] = true;
      }
    });

    // Also discover partners-of-partners (multi-marriage scenario)
    // e.g., Maralyn's partner Jim also married Angelica → include Angelica in this unit
    var morePartners = [];
    partners.forEach(function (p) {
      var pp = partnerOf[p.member._id.toString()] || [];
      pp.forEach(function (x) {
        if (x.id !== personId && memberMap[x.id] && !processedIds[x.id]) {
          morePartners.push({ member: memberMap[x.id], type: x.type });
          processedIds[x.id] = true;
        }
      });
    });
    partners = partners.concat(morePartners);

    // Find children of this person and ALL partners
    var childIds = [];
    var seen = {};

    var personChildren = childrenOf[personId] || [];
    personChildren.forEach(function (cid) {
      if (!seen[cid] && memberMap[cid]) {
        childIds.push(cid);
        seen[cid] = true;
      }
    });

    partners.forEach(function (p) {
      var partnerChildren = childrenOf[p.member._id.toString()] || [];
      partnerChildren.forEach(function (cid) {
        if (!seen[cid] && memberMap[cid]) {
          childIds.push(cid);
          seen[cid] = true;
        }
      });
    });

    // Sort children alphabetically
    childIds.sort(function (a, b) {
      var ma = memberMap[a];
      var mb = memberMap[b];
      return (ma.firstName || "").localeCompare(mb.firstName || "");
    });

    // Recursively build child units
    var childUnits = [];
    childIds.forEach(function (childId) {
      if (processedIds[childId]) return;
      processedIds[childId] = true;

      var unit = buildFamilyUnit(childId);
      if (unit) childUnits.push(unit);
    });

    return {
      person: person,
      partners: partners,
      children: childUnits,
    };
  }

  processedIds = {};
  processedIds[rootCouple.person._id.toString()] = true;

  var rootUnit = buildFamilyUnit(rootCouple.person._id.toString());

  // Find extended family: siblings connected to tree members but not placed in tree themselves
  // e.g. Dan Solomon is Rachel's brother — Rachel is in the tree but Dan has no parents in it
  var extendedFamily = [];
  siblingRels.forEach(function (r) {
    var fromId = r.from.toString();
    var toId = r.to.toString();
    var fromMember = memberMap[fromId];
    var toMember = memberMap[toId];
    if (!fromMember || !toMember) return;

    if (processedIds[fromId] && !processedIds[toId]) {
      extendedFamily.push({
        person: toMember,
        connectedTo: fromMember,
        type: "sibling",
      });
      processedIds[toId] = true;
    } else if (processedIds[toId] && !processedIds[fromId]) {
      extendedFamily.push({
        person: fromMember,
        connectedTo: toMember,
        type: "sibling",
      });
      processedIds[fromId] = true;
    }
  });

  // Also discover partners of extended family members
  // e.g. Ellen Solomon is married to Dan Solomon (who is in extended family)
  var extPartners = [];
  extendedFamily.forEach(function (ef) {
    var efId = ef.person._id.toString();
    var efPartnerInfos = partnerOf[efId] || [];
    efPartnerInfos.forEach(function (pi) {
      if (!processedIds[pi.id] && memberMap[pi.id]) {
        extPartners.push({
          person: memberMap[pi.id],
          connectedTo: ef.person,
          type: pi.type,
        });
        processedIds[pi.id] = true;
      }
    });
  });
  extendedFamily = extendedFamily.concat(extPartners);

  // Find friend/colleague connections (not part of the tree hierarchy)
  var friendTypes = ["friend", "colleague"];
  var friendRels = relationships.filter(function (r) {
    return friendTypes.indexOf(r.type) !== -1;
  });

  var friends = [];
  friendRels.forEach(function (r) {
    var fromMember = memberMap[r.from.toString()];
    var toMember = memberMap[r.to.toString()];
    if (fromMember && toMember) {
      friends.push({
        person: fromMember,
        connectedTo: toMember,
        type: r.type,
      });
    }
  });

  return {
    rootUnit: rootUnit,
    extendedFamily: extendedFamily,
    friends: friends,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — Manage family tree members and relationships
// ═══════════════════════════════════════════════════════════════════════════

// Admin management page
router.get("/admin", middleware.isAdmin, async function (req, res) {
  try {
    var members = await FamilyMember.find({})
      .populate("user")
      .sort({ lastName: 1, firstName: 1 });

    var relationships = await FamilyRelationship.find({})
      .populate("from to pendingRequestedBy")
      .sort({ type: 1 });

    var users;
    try {
      users = await User.find({})
        .sort({ lastName: 1, firstName: 1 });
    } catch (e) {
      console.log(e);
      users = [];
    }

    // Find pending connection requests
    var pendingConnections = users.filter(function (u) {
      return u.pendingConnectionType && u.pendingConnectionName;
    });

    // Find pending relationship updates
    var pendingRelUpdates = relationships.filter(function (r) {
      return r.pendingType;
    });

    res.render("familyTree/admin", {
      page: "admin",
      members: members,
      relationships: relationships,
      users: users,
      pendingConnections: pendingConnections,
      pendingRelUpdates: pendingRelUpdates,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Error loading family members.");
    res.redirect("/admin");
  }
});

// Create a new FamilyMember
router.post("/admin/member", middleware.isAdmin, upload.single("image"), async function (req, res) {
  try {
    var memberData = {
      firstName: (req.body.firstName || "").trim(),
      lastName: (req.body.lastName || "").trim(),
      deceased: req.body.deceased === "on",
      approved: req.body.approved === "on",
      notes: (req.body.notes || "").trim(),
    };

    // If an image was uploaded via Cloudinary
    if (req.file) {
      memberData.image = req.file.path;
    }

    if (!memberData.firstName || !memberData.lastName) {
      req.flash("error", "First and last name are required.");
      return res.redirect("/family-tree/admin");
    }

    // If linking to a user
    if (req.body.userId && req.body.userId !== "") {
      memberData.user = req.body.userId;
    }

    var member = await FamilyMember.create(memberData);

    // If linked to a user and approved, set their familyTreeId (and sync photo)
    if (member.user && member.approved) {
      var userUpdate = { familyTreeId: member._id };
      if (member.image) {
        userUpdate.image = member.image;
      }
      await User.findByIdAndUpdate(
        member.user,
        { $set: userUpdate },
      );
    }

    // Optionally create a relationship if specified
    var relatedToId = req.body.relatedToId;
    var relationshipType = req.body.relationshipType;

    if (relatedToId && relationshipType) {
      // "child" means the new member is a child of relatedTo → relatedTo is parent of new member
      var relData;
      if (relationshipType === "child") {
        relData = { from: relatedToId, to: member._id, type: "parent" };
      } else if (relationshipType === "parent") {
        relData = { from: member._id, to: relatedToId, type: "parent" };
      } else {
        relData = { from: member._id, to: relatedToId, type: relationshipType };
      }

      try {
        await FamilyRelationship.create(relData);
        console.log("[FAMILY TREE] Created relationship: " + relationshipType);
      } catch (relErr) {
        console.log("Error creating relationship:", relErr);
      }
    }

    console.log("[FAMILY TREE] Created member: " + member.firstName + " " + member.lastName);
    req.flash("success", "Added " + member.firstName + " " + member.lastName + " to the family tree.");
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error creating family member.");
    res.redirect("/family-tree/admin");
  }
});

// Edit a FamilyMember
router.put("/admin/member/:id", middleware.isAdmin, upload.single("image"), async function (req, res) {
  try {
    var update = {
      firstName: (req.body.firstName || "").trim(),
      lastName: (req.body.lastName || "").trim(),
      deceased: req.body.deceased === "on",
      notes: (req.body.notes || "").trim(),
    };

    // If an image was uploaded via Cloudinary
    if (req.file) {
      update.image = req.file.path;
    }

    var member = await FamilyMember.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true },
    );

    if (!member) {
      req.flash("error", "Error updating family member.");
      return res.redirect("/family-tree/admin");
    }

    // If photo was updated and member is linked to a user, sync their profile photo too
    if (req.file && member.user) {
      try {
        await User.findByIdAndUpdate(
          member.user,
          { $set: { image: req.file.path } },
        );
      } catch (syncErr) {
        console.log("Error syncing photo to user:", syncErr);
      }
    }

    req.flash("success", "Updated " + member.firstName + " " + member.lastName + ".");
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error updating family member.");
    res.redirect("/family-tree/admin");
  }
});

// Delete a FamilyMember + cascade relationships
router.delete("/admin/member/:id", middleware.isAdmin, async function (req, res) {
  try {
    var member = await FamilyMember.findById(req.params.id);
    if (!member) {
      req.flash("error", "Family member not found.");
      return res.redirect("/family-tree/admin");
    }

    var name = member.firstName + " " + member.lastName;

    // Remove familyTreeId from linked user
    if (member.user) {
      try {
        await User.findByIdAndUpdate(
          member.user,
          { $unset: { familyTreeId: "" } },
        );
      } catch (unlinkErr) {
        console.log("Error clearing familyTreeId:", unlinkErr);
      }
    }

    // Delete all relationships involving this member
    try {
      await FamilyRelationship.deleteMany(
        { $or: [{ from: member._id }, { to: member._id }] },
      );
    } catch (relErr) {
      console.log("Error deleting relationships:", relErr);
    }

    await FamilyMember.deleteOne({ _id: member._id });

    console.log("[FAMILY TREE] Deleted member: " + name);
    req.flash("success", "Deleted " + name + " and all their relationships.");
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error deleting family member.");
    res.redirect("/family-tree/admin");
  }
});

// Link a no-profile node to a real user
router.post("/admin/member/:id/link", middleware.isAdmin, async function (req, res) {
  try {
    if (!req.body.userId || req.body.userId === "") {
      req.flash("error", "Please select a user to link.");
      return res.redirect("/family-tree/admin");
    }

    var member = await FamilyMember.findById(req.params.id);
    if (!member) {
      req.flash("error", "Family member not found.");
      return res.redirect("/family-tree/admin");
    }

    member.user = req.body.userId;
    await member.save();

    // Set the user's familyTreeId if member is approved
    if (member.approved) {
      try {
        await User.findByIdAndUpdate(
          req.body.userId,
          { $set: { familyTreeId: member._id } },
        );
      } catch (linkErr) {
        console.log("Error setting familyTreeId:", linkErr);
      }
    }

    console.log("[FAMILY TREE] Linked " + member.firstName + " " + member.lastName + " to user " + req.body.userId);
    req.flash("success", "Linked " + member.firstName + " " + member.lastName + " to user account.");
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error linking user.");
    res.redirect("/family-tree/admin");
  }
});

// Toggle approved status
router.post("/admin/member/:id/approve", middleware.isAdmin, async function (req, res) {
  try {
    var member = await FamilyMember.findById(req.params.id);
    if (!member) {
      req.flash("error", "Family member not found.");
      return res.redirect("/family-tree/admin");
    }

    member.approved = !member.approved;
    await member.save();

    // Update the linked user's familyTreeId
    if (member.user) {
      try {
        if (member.approved) {
          await User.findByIdAndUpdate(
            member.user,
            { $set: { familyTreeId: member._id } },
          );
        } else {
          await User.findByIdAndUpdate(
            member.user,
            { $unset: { familyTreeId: "" } },
          );
        }
      } catch (linkErr) {
        console.log("Error updating familyTreeId:", linkErr);
      }
    }

    req.flash(
      "success",
      member.firstName + " " + member.lastName + " is now " +
      (member.approved ? "approved" : "unapproved") + ".",
    );
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error updating approval status.");
    res.redirect("/family-tree/admin");
  }
});

// Create a relationship
router.post("/admin/relationship", middleware.isAdmin, async function (req, res) {
  try {
    var fromId = req.body.fromId;
    var toId = req.body.toId;
    var type = req.body.type;

    if (!fromId || !toId || !type) {
      req.flash("error", "Please select both people and a relationship type.");
      return res.redirect("/family-tree/admin");
    }

    if (fromId === toId) {
      req.flash("error", "Cannot create a relationship between a person and themselves.");
      return res.redirect("/family-tree/admin");
    }

    await FamilyRelationship.create({ from: fromId, to: toId, type: type });

    console.log("[FAMILY TREE] Created relationship: " + type);
    req.flash("success", "Relationship created.");
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error creating relationship.");
    res.redirect("/family-tree/admin");
  }
});

// Update a relationship type
router.put("/admin/relationship/:id", middleware.isAdmin, async function (req, res) {
  try {
    var newType = req.body.type;
    if (!newType) {
      req.flash("error", "Please select a relationship type.");
      return res.redirect("/family-tree/admin");
    }

    var rel = await FamilyRelationship.findByIdAndUpdate(
      req.params.id,
      { $set: { type: newType } },
      { new: true },
    );

    if (!rel) {
      req.flash("error", "Error updating relationship.");
      return res.redirect("/family-tree/admin");
    }

    console.log("[FAMILY TREE] Updated relationship to: " + newType);
    req.flash("success", "Relationship updated to " + newType + ".");
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error updating relationship.");
    res.redirect("/family-tree/admin");
  }
});

// Delete a relationship
router.delete("/admin/relationship/:id", middleware.isAdmin, async function (req, res) {
  try {
    await FamilyRelationship.findByIdAndDelete(req.params.id);
    req.flash("success", "Relationship deleted.");
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error deleting relationship.");
    res.redirect("/family-tree/admin");
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — Approve or dismiss pending connection requests
// ═══════════════════════════════════════════════════════════════════════════

// Approve a pending connection: create member, link user, create relationship
router.post("/admin/connection/:userId/approve", middleware.isAdmin, async function (req, res) {
  try {
    var user = await User.findById(req.params.userId);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/family-tree/admin");
    }

    if (!user.pendingConnectionType || !user.pendingConnectionName) {
      req.flash("error", "No pending connection request for this user.");
      return res.redirect("/family-tree/admin");
    }

    var connectionType = user.pendingConnectionType;
    var connectionName = user.pendingConnectionName;

    // Find the "connected to" member by name
    var members = await FamilyMember.find({ approved: true });

    // Match by "firstName lastName" (case-insensitive)
    var connectedTo = null;
    members.forEach(function (m) {
      var fullName = (m.firstName + " " + m.lastName).toLowerCase();
      if (fullName === connectionName.toLowerCase()) {
        connectedTo = m;
      }
    });

    if (!connectedTo) {
      req.flash("error", "Could not find a family member named \"" + connectionName + "\". Create them first, then approve.");
      return res.redirect("/family-tree/admin");
    }

    // Check if user already has a FamilyMember
    if (user.familyTreeId) {
      // Already linked — just create the relationship and clear pending
      await createRelAndClear(user.familyTreeId, connectedTo._id, connectionType, user, res, req);
    } else {
      // Create a new FamilyMember for this user
      var memberData = {
        firstName: user.firstName,
        lastName: user.lastName,
        user: user._id,
        approved: true,
      };

      var newMember = await FamilyMember.create(memberData);

      // Link user to member
      user.familyTreeId = newMember._id;

      await createRelAndClear(newMember._id, connectedTo._id, connectionType, user, res, req);
    }
  } catch (err) {
    console.log(err);
    req.flash("error", "Error approving connection.");
    res.redirect("/family-tree/admin");
  }
});

async function createRelAndClear(newMemberId, connectedToId, connectionType, user, res, req) {
  // Build the relationship based on connection type
  var relType;
  var fromId, toId;
  if (connectionType === "child") {
    // "I am their child" → connectedTo is parent of newMember
    fromId = connectedToId;
    toId = newMemberId;
    relType = "parent";
  } else if (connectionType === "parent") {
    // "I am their parent" → newMember is parent of connectedTo
    fromId = newMemberId;
    toId = connectedToId;
    relType = "parent";
  } else {
    // spouse, fiance, dating, sibling, friend — symmetric-ish
    fromId = newMemberId;
    toId = connectedToId;
    relType = connectionType;
  }

  // Check for existing relationship between these two (in either direction, same type)
  var existing = await FamilyRelationship.findOne({
    $or: [
      { from: fromId, to: toId, type: relType },
      { from: toId, to: fromId, type: relType },
    ],
  });

  if (existing) {
    // Relationship already exists — skip creation, just clear pending
    console.log("[FAMILY TREE] Relationship already exists, skipping creation.");
  } else {
    try {
      await FamilyRelationship.create({ from: fromId, to: toId, type: relType });
    } catch (relErr) {
      console.log("Error creating relationship:", relErr);
    }
  }

  // Clear pending fields and save familyTreeId
  user.pendingConnectionType = undefined;
  user.pendingConnectionName = undefined;
  await user.save();
  req.flash("success", "Approved! " + user.firstName + " " + user.lastName + " has been added to the family tree.");
  res.redirect("/family-tree/admin");
}

// Dismiss a pending connection request (just clears the pending fields)
router.post("/admin/connection/:userId/dismiss", middleware.isAdmin, async function (req, res) {
  try {
    await User.findByIdAndUpdate(
      req.params.userId,
      { $unset: { pendingConnectionType: "", pendingConnectionName: "" } },
    );
    req.flash("success", "Connection request dismissed.");
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error dismissing request.");
    res.redirect("/family-tree/admin");
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SELF-SERVICE — Request to join the family tree
// ═══════════════════════════════════════════════════════════════════════════

router.post("/request-join", middleware.isLoggedIn, async function (req, res) {
  try {
    // Same security gate as the GET route — must be in an official group
    var hasAccess = req.user.familyTreeId || req.user.isAdmin ||
      (req.user.tournamentGroups && req.user.tournamentGroups.some(function (g) { return g.isOfficial; }));
    if (!hasAccess) {
      req.flash("error", "The family tree is available to members of the official McNaughton Madness group.");
      return res.redirect("/tournamentGroups");
    }

    var connectionType = (req.body.connectionType || "").trim();
    var connectionName = (req.body.connectionName || "").trim();

    if (!connectionType || !connectionName) {
      req.flash("error", "Please select how you're connected and enter the person's name.");
      return res.redirect("/family-tree");
    }

    await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          pendingConnectionType: connectionType,
          pendingConnectionName: connectionName,
        },
      },
    );

    console.log("[FAMILY TREE] " + req.user.firstName + " " + req.user.lastName + " requested to join: " + connectionType + " of " + connectionName);
    req.flash("success", "Your request to join the family tree has been submitted! An admin will review it soon.");
    res.redirect("/family-tree");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error submitting request.");
    res.redirect("/family-tree");
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SELF-SERVICE — Family members propose relationship updates
// ═══════════════════════════════════════════════════════════════════════════

// Propose a relationship type change (e.g. engaged → married)
router.post("/propose-update", middleware.isLoggedIn, async function (req, res) {
  var editUrl = "/users/" + req.user.username + "/edit";
  try {
    var relationshipId = req.body.relationshipId;
    var proposedType = req.body.proposedType;

    if (!relationshipId || !proposedType) {
      req.flash("error", "Missing relationship or proposed type.");
      return res.redirect(editUrl);
    }

    // Only allow partner-type proposals
    var allowedTypes = ["spouse", "fiance", "dating"];
    if (allowedTypes.indexOf(proposedType) === -1) {
      req.flash("error", "Invalid relationship type.");
      return res.redirect(editUrl);
    }

    // Verify the user is part of this relationship
    var rel = await FamilyRelationship.findById(relationshipId);
    if (!rel) {
      req.flash("error", "Relationship not found.");
      return res.redirect(editUrl);
    }

    var userFamilyId = req.user.familyTreeId ? req.user.familyTreeId.toString() : null;
    var fromId = rel.from.toString();
    var toId = rel.to.toString();

    if (userFamilyId !== fromId && userFamilyId !== toId) {
      req.flash("error", "You can only propose changes to your own relationships.");
      return res.redirect(editUrl);
    }

    // Don't allow proposing the same type it already is
    if (rel.type === proposedType) {
      req.flash("error", "That's already the current relationship type.");
      return res.redirect(editUrl);
    }

    rel.pendingType = proposedType;
    rel.pendingRequestedBy = req.user._id;
    rel.pendingRequestedAt = new Date();
    await rel.save();

    var typeLabel =
      proposedType === "spouse" ? "Married" :
      proposedType === "fiance" ? "Engaged" :
      proposedType === "dating" ? "Dating" : proposedType;

    console.log("[FAMILY TREE] " + req.user.firstName + " proposed relationship change to: " + proposedType);
    req.flash("success", "Your proposal to change to \"" + typeLabel + "\" has been submitted for admin approval!");
    res.redirect(editUrl);
  } catch (err) {
    console.log(err);
    req.flash("error", "Error submitting proposal.");
    res.redirect(editUrl);
  }
});

// Admin: approve a pending relationship update
router.post("/admin/relationship/:id/approve-update", middleware.isAdmin, async function (req, res) {
  try {
    var rel = await FamilyRelationship.findById(req.params.id);
    if (!rel) {
      req.flash("error", "Relationship not found.");
      return res.redirect("/family-tree/admin");
    }

    if (!rel.pendingType) {
      req.flash("error", "No pending update to approve.");
      return res.redirect("/family-tree/admin");
    }

    var oldType = rel.type;
    rel.type = rel.pendingType;
    rel.pendingType = undefined;
    rel.pendingRequestedBy = undefined;
    rel.pendingRequestedAt = undefined;
    await rel.save();

    console.log("[FAMILY TREE] Approved relationship change: " + oldType + " → " + rel.type);
    req.flash("success", "Relationship updated from " + oldType + " to " + rel.type + ".");
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error approving update.");
    res.redirect("/family-tree/admin");
  }
});

// Admin: reject a pending relationship update
router.post("/admin/relationship/:id/reject-update", middleware.isAdmin, async function (req, res) {
  try {
    var rel = await FamilyRelationship.findById(req.params.id);
    if (!rel) {
      req.flash("error", "Relationship not found.");
      return res.redirect("/family-tree/admin");
    }

    rel.pendingType = undefined;
    rel.pendingRequestedBy = undefined;
    rel.pendingRequestedAt = undefined;
    await rel.save();

    console.log("[FAMILY TREE] Rejected pending relationship update");
    req.flash("success", "Pending relationship update rejected.");
    res.redirect("/family-tree/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error rejecting update.");
    res.redirect("/family-tree/admin");
  }
});

module.exports = router;
