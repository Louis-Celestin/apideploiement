const uuid = require("uuid");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const format = require("date-format");
const cnx1 = require("../../services/getData/dbConnect")
const {calculateDistance} = require("../../services/getData/calculeDistance")

const makeRoutine = async (req, res) => {
    try {

        console.log(req.body)
        console.log(req.body.tpeList)
        // Récupération des données de la requête
        const { commercialId, pointMarchand, veilleConcurrentielle, tpeList, latitudeReel,longitudeReel } = req.body;
        console.log(pointMarchand);
        
        // Recherche de l'agent commercial
        const agent = await prisma.agent.findUnique({
            where: { id: Number(commercialId) },
            include: { zone_commerciale: true }
        });

        if (!agent) {
            return res.status(400).json({ message: "Cet agent n'existe pas dans la base" });
        }

        // Vérification du point marchand
        const pointMarchandQuery = `%${pointMarchand}%`;
        cnx1.conn.query("SELECT * FROM POINT_MARCHAND WHERE POINT_MARCHAND LIKE ?", [pointMarchandQuery], (error, results, fields) => {
            if (error) {
                console.log(error);
                return res.status(500).json({ message: "Une erreur s'est produite lors de la recherche du point marchand" });
            }

            if (!results.length) {
                return res.status(400).json({ message: "Ce point marchand n'existe pas" });
            }

            if (results[0].ZONE_GP !== agent.zone_commerciale.nom_zone) {
                console.log(results[0].ZONE_GP,agent.zone_commerciale.nom_zone)
                return res.status(400).json({ message: "Vous n'avez pas le droit de visite" });
            }else{
                console.log("OK")
                console.log(latitudeReel,longitudeReel,Number(results[0].LATITUDE), Number(results[0].LONGITUDE))
                const distance = calculateDistance(latitudeReel,longitudeReel,Number(results[0].LATITUDE), Number(results[0].LONGITUDE))
                console.log(distance)
                if(distance > 2){
                    return res.status(400).json({message : "Vous devez être chez le point marchand pour effectuer la visite"})
                }else{
                    prisma.routine.create({
                        data: {
                            date_routine: format.now(),
                            veille_concurentielle_routine: veilleConcurrentielle,
                            point_marchand_routine: pointMarchand,
                            commercial_routine_id: commercialId,
                            numero_routine: "ROUTINE-" + uuid.v4().toUpperCase(),
                            latitude_marchand_routine: results[0].LATITUDE,
                            longitude_marchand_routine: results[0].LONGITUDE
                            // Complétez les champs de routine selon les données de la requête
                        }
                    }).then(routine => {
                        // Enregistrement des TPE associés à cette routine
                        const tpePromises = tpeList.map(async (tpe) => {
                            const { etatChargeur, etatTpe, problemeBancaire, problemeMobile, idTerminal,descriptionProblemeMobile,descriptionProblemeBancaire } = tpe;
                            const newTpe = await prisma.tpe_routine.create({
                                data: {
                                    etat_chargeur_tpe_routine: etatChargeur,
                                    etat_tpe_routine: etatTpe,
                                    probleme_mobile: problemeMobile,
                                    description_probleme_mobile: descriptionProblemeMobile,
                                    probleme_bancaire: problemeBancaire,
                                    description_problemebancaire: descriptionProblemeBancaire,
                                    id_terminal_tpe_routine: idTerminal,
                                    routine_id: routine.id // Associez le TPE à la routine créée
                                }
                            });
                            return newTpe;
                        });
                        Promise.all(tpePromises).then((tpeResults) => {
                            if (!tpeResults || tpeResults.some((tpe) => !tpe)) {
                                console.log("Erreur lors de l'enregistrement des TPE");
                                return res.status(500).json({ message: "Erreur lors de l'enregistrement des TPE" });
                            }
                            return res.status(200).json({ message: "Votre visite a bien été enregistrée" });
                        }).catch((error) => {
                            console.log(error);
                            return res.status(500).json({ message: "Une erreur s'est produite lors de l'enregistrement des TPE" });
                        });
                    }).catch((error) => {
                        console.log(error);
                        return res.status(500).json({ message: "Une erreur s'est produite lors de la création de la routine" });
                    });
                }
            }
            // Création de la routine
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Une erreur s'est produite lors de l'enregistrement de la visite" });
    }
};

const getRoutine = async(req,res)=>{
     prisma.routine.findMany({
        include:{
            tpe_routine : true
        }
     }).then(results=>{
        if(results.length){
            return res.status(200).json(results)
        }else{
            return res.status(400).json({message : "Aucune routine trouvée"})
        }
     }).catch(err=>{
        console.log(err)
     })
}

const getRoutineByCommercial = async(req,res)=>{

    console.log(req.body)
    const idCommercial = req.body.idCommercial

    prisma.agent.findUnique({
        where : {
            id : Number(idCommercial)
        }
    }).then(agent=>{
        if(agent){
            prisma.routine.findMany({
                where : {commercial_routine_id : Number(idCommercial)}
            }).then(routine=>{
                if(routine.length){
                    return res.status(200).json(routine)
                }else{
                    return res.status(400).json({message : "Vous n'avez pas de routine"})
                }
            }).catch(err=>{
                console.log(err)
            })
        }else{
            return res.status(400).json({message : "Ce commercial n'existe pas"})
        }
    }).catch(err=>{
        console.log(err)
    })

}   
module.exports = { makeRoutine , getRoutine, getRoutineByCommercial};


