const express = require("express");
const mongoose = require("mongoose");
const QRCode = require("qrcode");

const TreeSpecies = require("./models/TreeSpecies"); // Assegure-se de que o caminho está correto
const Video = require("./models/Video"); // Ajuste o caminho conforme necessário
const PointOfInterest = require("./models/PointOfInterest");
const Garden = require("./models/Garden");

const app = express();
const PORT = process.env.PORT || 3000;

// Define a pasta que será servida publicamente
app.use(express.static("public"));

// Define o motor de renderização EJS
app.set("view engine", "ejs");

//permite usar métodos HTTP, como PUT ou DELETE, em lugares onde o cliente não os suporta
const methodOverride = require("method-override");

// Depois de inicializar o app
app.use(methodOverride("_method"));

app.use(express.json()); // Middleware para analisar o corpo da solicitação JSON
app.use(express.urlencoded({ extended: true }));

// Conexão com a base de dados MongoDB
mongoose.connect("mongodb://localhost:27017/esas_tree_species_db");

// Rota raiz que renderiza a homepage.ejs
app.get("/", (req, res) => {
  res.render("homepage");
});

// Rota para listar jardins
app.get("/gardens", async (req, res) => {
  try {
    const gardens = await Garden.find();
    res.render("./gardens/index", { gardens });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Rota para mostrar o formulário de adição de jardins
app.get("/gardens/add", (req, res) => {
  res.render("./gardens/add-garden");
});

// Rota para processar o formulário de adição de jardins
app.post("/gardens", async (req, res) => {
  const { name, longitude, latitude } = req.body;

  // Certifique-se de que longitude e latitude são números
  const coordinates = [parseFloat(longitude), parseFloat(latitude)];

  if (isNaN(coordinates[0]) || isNaN(coordinates[1])) {
    return res
      .status(400)
      .send("Longitude e latitude devem ser números válidos.");
  }
  try {
    const garden = new Garden({
      name,
      location: {
        type: "Point",
        coordinates,
      },
    });
    await garden.save();
    res.redirect("/gardens");
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao guardar o jardim");
  }
});

// Rota para listar jardins e preparar a adição de árvores
app.get("/gardens/manage", async (req, res) => {
  try {
    const gardens = await Garden.find().populate("trees");
    const trees = await TreeSpecies.find();
    // Marca árvores que já estão associadas a algum jardim
    const markedTrees = trees.map((tree) => {
      let isInGarden = gardens.some((garden) =>
        garden.trees.some((gardenTree) => gardenTree.equals(tree._id))
      );
      return {
        ...tree._doc,
        isInGarden: isInGarden,
      };
    });

    res.render("gardens/manage-gardens", { gardens, trees: markedTrees });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao carregar a página de gestão de jardins");
  }
});

// Rota para Mostrar Árvores Disponíveis para Adicionar ao Jardim
app.get("/gardens/:gardenId/add-trees", async (req, res) => {
  const { gardenId } = req.params;
  try {
    const trees = await TreeSpecies.find();
    const garden = await Garden.findById(gardenId);
    res.render("add-trees-to-garden", { trees, garden });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao carregar árvores para adicionar ao jardim");
  }
});

// Rota para Processar Adição de Árvores ao Jardim
app.post("/gardens/:gardenId/add-trees", async (req, res) => {
  const { gardenId } = req.params;
  let { treeIds } = req.body;
  treeIds = Array.isArray(treeIds) ? treeIds : [treeIds];

  try {
    // Filtra árvores que já estão associadas a qualquer jardim
    const availableTrees = await TreeSpecies.find({
      _id: { $in: treeIds },
      garden: { $exists: false },
    }).select("_id");
    const availableTreeIds = availableTrees.map((tree) => tree._id);

    if (availableTreeIds.length > 0) {
      await Garden.findByIdAndUpdate(gardenId, {
        $addToSet: { trees: { $each: availableTreeIds } },
      });

      // Marca as árvores adicionadas como associadas ao jardim
      await TreeSpecies.updateMany(
        { _id: { $in: availableTreeIds } },
        { $set: { garden: gardenId } }
      );

      res.redirect("/gardens/manage");
    } else {
      res
        .status(400)
        .send("Todas as árvores selecionadas já estão associadas a jardins.");
    }
  } catch (error) {
    console.error("Erro ao adicionar árvores ao jardim:", error);
    res.status(500).send("Erro ao processar a solicitação.");
  }
});

// Rota para editar jardins
app.get("/gardens/:gardenId/edit", async (req, res) => {
  try {
    const { gardenId } = req.params;
    const garden = await Garden.findById(gardenId);
    if (!garden) {
      return res.status(404).send("Jardim não encontrado.");
    }
    res.render("./gardens/edit-gardens", { garden });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao buscar jardim para edição.");
  }
});

// Rota Post para processar a Edição
app.post("/gardens/:gardenId/edit", async (req, res) => {
  const { name, longitude, latitude } = req.body;
  const coordinates = [parseFloat(longitude), parseFloat(latitude)];
  const { gardenId } = req.params;

  try {
    await Garden.findByIdAndUpdate(gardenId, {
      name,
      location: { type: "Point", coordinates },
    });
    res.redirect("/gardens");
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao atualizar o jardim.");
  }
});

// Rota GET para detalhes do jardim
app.get("/gardens/:gardenId", async (req, res) => {
  const { gardenId } = req.params;

  try {
    // Busca o jardim pelo ID e popula com as árvores associadas
    // Certifique-se de que o nome do campo que contém as referências das árvores é 'trees'
    const garden = await Garden.findById(gardenId).populate("trees");

    if (!garden) {
      return res.status(404).send("Jardim não encontrado");
    }

    // Renderiza a view 'detail.ejs' passando o objeto garden encontrado
    res.render("./gardens/detail", { garden });
  } catch (error) {
    console.error("Erro ao buscar detalhes do jardim:", error);
    res.status(500).send("Erro ao processar a solicitação");
  }
});

// Rota Post para remover um jardim
app.post("/gardens/:gardenId/delete", async (req, res) => {
  try {
    const { gardenId } = req.params;
    await Garden.findByIdAndDelete(gardenId);
    res.redirect("/gardens");
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao remover o jardim.");
  }
});

// Rota para remover árvores do jardim
app.post("/gardens/:gardenId/remove-trees", async (req, res) => {
  const { gardenId } = req.params;
  let { treeIdsToRemove } = req.body;

  // Assegura que treeIdsToRemove é um array
  if (!Array.isArray(treeIdsToRemove)) {
    treeIdsToRemove = [treeIdsToRemove].filter(Boolean); // Filtra valores falsy como null ou undefined
  }

  try {
    await Garden.findByIdAndUpdate(gardenId, {
      $pull: { trees: { $in: treeIdsToRemove } },
    });
    res.redirect("back");
  } catch (error) {
    console.error("Erro ao remover árvores:", error);
    res.status(500).send("Erro ao processar a solicitação");
  }
});

// Rota para listar espécies
app.get("/species", async (req, res) => {
  let perPage = 9; // Número de itens por página
  let page = req.query.page || 1; // Página atual

  try {
    const totalItems = await TreeSpecies.countDocuments(); // Conta o total de documentos
    const species = await TreeSpecies.find()
      .skip(perPage * page - perPage)
      .limit(perPage);

    res.render("species/index", {
      species: species,
      current: page,
      pages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao buscar espécies.");
  }
});

// Rota para o formulário de adição de uma nova espécie
app.get("/species/add", (req, res) => {
  res.render("./species/add-species");
});

// Rota para visualizar uma espécie individualmente
app.get("/species/:id", async (req, res) => {
  try {
    const speciesId = req.params.id;
    const species = await TreeSpecies.findById(speciesId);
    if (!species) {
      return res.status(404).send("Espécie não encontrada");
    }
    res.render("species/detail", { species }); // Renderiza a view com os detalhes da espécie
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao procurar a espécie");
  }
});

// Rota POST para adicionar uma nova espécie
app.post("/species", async (req, res) => {
  try {
    const newSpecies = new TreeSpecies(req.body);
    await newSpecies.save();
    res.redirect("/species"); // Redireciona para a lista de espécies após a adição
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao adicionar a espécie");
  }
});

// Rota para editar uma espécie específica
app.get("/species/edit/:id", async (req, res) => {
  try {
    const specie = await TreeSpecies.findById(req.params.id);
    if (!specie) {
      return res.status(404).send("Espécie não encontrada");
    }
    res.render("species/edit-species", { specie });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao aceder à espécie");
  }
});

//Rota para atualizar uma espécie específica
app.patch("/species/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedSpecie = await TreeSpecies.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updatedSpecie) {
      return res.status(404).send("Espécie não encontrada.");
    }
    res.redirect("/species"); // Ou renderize alguma view específica
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao atualizar a espécie.");
  }
});

// EXCLUIR uma espécie arbórea pelo ID
app.get("/species/delete/:id", async (req, res) => {
  try {
    const deleteResult = await TreeSpecies.findByIdAndDelete(req.params.id);
    if (!deleteResult) {
      return res.status(404).send("Espécie não encontrada.");
    }
    res.redirect("/species");
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao excluír a espécie: " + error.message);
  }
});

// READ - Listar todos os vídeos
app.get("/videos", async (req, res) => {
  try {
    const videos = await Video.find();
    res.render("./videos/index", { videos });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Rota para o formulário de adição de um novo video
app.get("/videos/add", (req, res) => {
  res.render("./videos/add");
});

// CREATE - Adicionar um novo vídeo
app.post("/videos", async (req, res) => {
  try {
    const newVideo = new Video(req.body);
    await newVideo.save();
    res.redirect("/videos");
  } catch (error) {
    res.status(500).send(error);
  }
});

// Formulário para editar um vídeo
app.get("/videos/edit/:id", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    res.render("videos/edit", { video });
  } catch (error) {
    res.status(500).send(error);
  }
});
// Rota para atualizar um vídeo específico
app.put("/videos/:id", async (req, res) => {
  try {
    await Video.findByIdAndUpdate(req.params.id, req.body);
    res.redirect("/videos");
  } catch (error) {
    res.status(500).send(error);
  }
});

// DELETE - Remover um vídeo
app.get("/videos/delete/:id", async (req, res) => {
  try {
    await Video.findByIdAndDelete(req.params.id);
    res.redirect("/videos");
  } catch (error) {
    res.status(500).send(error);
  }
});

// READ - Rota para listar todos os pontos de interesse
app.get("/points-of-interest", async (req, res) => {
  try {
    const points = await PointOfInterest.find();
    res.render("points-of-interest/index", { points });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Rota para mostrar o formulário adicionar novo ponto de interesse
app.get("/points-of-interest/add", (req, res) => {
  res.render("./points-of-interest/add");
});

// Rota para processar os dados do formulário de adição
app.post("/points-of-interest", async (req, res) => {
  try {
    const { name, latitude, longitude, description, additionalInfo } = req.body;
    const newPoint = new PointOfInterest({
      name,
      latitude,
      longitude,
      description,
      additionalInfo, // Guarda additionalInfo na base de dados
      // Não definimos ainda o qrCodeData porque precisamos gerá-lo
    });

    // Combina informações para o texto do QR-Code. Aqui pode personalizar conforme necessário
    const qrCodeText = `Name: ${name}\nLatitude: ${latitude}\nLongitude: ${longitude}\nDescription: ${description}\nAdditional Info: ${additionalInfo}`;

    // Gera QR-Code como Data URL
    const qrCodeData = await QRCode.toDataURL(qrCodeText);

    // Guarda os dados do QR-Code no novo ponto de interesse
    newPoint.qrCodeData = qrCodeData;
    await newPoint.save();

    // Redireciona para a lista de pontos de interesse após a criação
    res.redirect("/points-of-interest");
  } catch (error) {
    console.error("Erro ao guardar o novo ponto de interesse:", error);
    res.status(500).send("Erro ao adicionar novo ponto de interesse.");
  }
});

// rota: view detail
app.get("/points-of-interest/detail/:id", async (req, res) => {
  try {
    const point = await PointOfInterest.findById(req.params.id);
    if (!point) {
      return res.status(404).send("Ponto de interesse não encontrado.");
    }
    res.render("points-of-interest/detail", { point });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Rota para editar um ponto de interesse
app.get("/points-of-interest/edit/:id", async (req, res) => {
  try {
    const point = await PointOfInterest.findById(req.params.id);
    res.render("points-of-interest/edit", { point });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Rota para atualizar um ponto de interesse
app.put("/points-of-interest/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, description, additionalInfo } = req.body;

    // Pesquisa o ponto de interesse atual para comparar com additionalInfo
    const currentPoint = await PointOfInterest.findById(id);

    let qrCodeData = currentPoint.qrCodeData; // Assume o valor antigo por padrão

    // Verifica se additionalInfo foi fornecido e é diferente do valor anterior
    if (additionalInfo && additionalInfo !== currentPoint.additionalInfo) {
      // Gera um novo QR Code
      const qrCodeText = `Name: ${name}\nLatitude: ${latitude}\nLongitude: ${longitude}\nDescription: ${description}\nAdditional Info: ${additionalInfo}`;
      qrCodeData = await QRCode.toDataURL(qrCodeText); // Uso direto da biblioteca QRCode
    }

    // Atualiza o ponto de interesse com novos valores, incluindo o novo QR Code, se gerado
    await PointOfInterest.findByIdAndUpdate(
      id,
      {
        name,
        latitude,
        longitude,
        description,
        additionalInfo,
        qrCodeData,
      },
      { new: true }
    );

    res.redirect("/points-of-interest");
  } catch (error) {
    console.error("Erro ao atualizar o ponto de interesse:", error);
    res.status(500).send("Erro ao atualizar o ponto de interesse.");
  }
});

// DELETE - Rota para excluír um ponto de interesse
app.get("/points-of-interest/delete/:id", async (req, res) => {
  try {
    await PointOfInterest.findByIdAndDelete(req.params.id);
    res.redirect("/points-of-interest");
  } catch (error) {
    res.status(500).send(error);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor em execução na porta ${PORT}`);
});
